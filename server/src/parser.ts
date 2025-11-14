/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions */

import {
	DiagnosticSeverity,
	SemanticTokensBuilder,
} from 'vscode-languageserver';
import {
	FileDiagnostic,
	LexerToken,
	MacroRegistryItem,
	SyntaxIssue,
	Token,
} from './types';
import {
	adjacentTokens,
	createTokenIndex,
	genSyntaxDiagnostic,
	linkAstToComments,
	normalizePath,
	positionInBetween,
	sameLine,
	sanitizeCExpression,
	startsWithLetter,
	validateToken,
	validateValue,
	validToken,
	VIRTUAL_DOC,
} from './helpers';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRootNode,
	DtcRefNode,
	NodeName,
	NodeAddress,
} from './ast/dtc/node';
import { ASTBase } from './ast/base';
import { Label, LabelAssign } from './ast/dtc/label';
import { LabelRef } from './ast/dtc/labelRef';
import { DtcProperty, PropertyName } from './ast/dtc/property';
import { DeleteNode } from './ast/dtc/deleteNode';
import { Keyword } from './ast/keyword';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { StringValue } from './ast/dtc/values/string';
import { PropertyValue } from './ast/dtc/values/value';
import { NodePath, NodePathRef } from './ast/dtc/values/nodePath';
import { NumberValue } from './ast/dtc/values/number';
import { ByteStringValue } from './ast/dtc/values/byteString';
import { PropertyValues } from './ast/dtc/values/values';
import { DtsDocumentVersion } from './ast/dtc/dtsDocVersion';
import { ArrayValues } from './ast/dtc/values/arrayValue';
import { LabeledValue } from './ast/dtc/values/labeledValue';
import { Expression } from './ast/cPreprocessors/expression';
import { BaseParser } from './baseParser';
import { CPreprocessorParser } from './cPreprocessorParser';
import { Include } from './ast/cPreprocessors/include';
import { DtsMemreserveNode } from './ast/dtc/memreserveNode';
import { DtsBitsNode } from './ast/dtc/bitsNode';
import { Lexer } from './lexer';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { CMacroCall } from './ast/cPreprocessors/functionCall';

type AllowNodeRef = 'Ref' | 'Name';

export class Parser extends BaseParser {
	public tokens: Token[] = [];
	cPreprocessorParser: CPreprocessorParser;

	injectedMacros: (CMacroCall | CIdentifier)[] = [];
	others: ASTBase[] = [];
	rootDocument = new DtcBaseNode();
	unhandledStatements = new DtcRootNode();
	injectedMacros: (CMacroCall | CIdentifier)[] = [];

	constructor(
		public readonly uri: string,
		private incudes: string[],
		macros?: Map<string, MacroRegistryItem>,
		getTokens?: () => Token[],
		optimizeForFormatting?: boolean,
	) {
		super();
		this.cPreprocessorParser = new CPreprocessorParser(
			this.uri,
			this.incudes,
			macros,
			getTokens,
			optimizeForFormatting,
		);
	}

	get issues(): FileDiagnostic[] {
		return [...this._issues, ...this.cPreprocessorParser.issues];
	}

	getFiles() {
		return [
			this.uri,
			...(this.cPreprocessorParser.dtsIncludes
				.flatMap((include) => include.resolvedPath)
				.filter((f) => !!f) as string[]),
		];
	}

	protected reset() {
		super.reset();
		this.others = [];
		this.injectedMacros = [];
		this.rootDocument = new DtcBaseNode();
		this._issues = [];
		this.unhandledStatements = new DtcRootNode();
	}

	public async reparse(): Promise<void> {
		const t = performance.now();
		const stable = this.stable;
		this.parsing = new Promise<void>((resolve) => {
			stable.then(async () => {
				this.reset();
				await this.cPreprocessorParser.reparse();
				await this.parse();
				console.log('parsing', performance.now() - t);
				resolve();
			});
		});
		return this.parsing;
	}

	async parse() {
		await this.cPreprocessorParser.stable;
		this.tokens = this.cPreprocessorParser.tokens;

		if (normalizePath(this.uri).endsWith('.h')) return;

		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		const process = async () => {
			if (
				!(
					this.isDtsDocumentVersion() ||
					this.isMemreserve() ||
					this.isPlugin() ||
					this.isRootNodeDefinition(this.rootDocument) ||
					this.isDeleteNode(this.rootDocument, 'Ref') ||
					this.processInjectPreProcessorMacros(
						this.cPreprocessorParser.macros,
					) ||
					// Valid use case
					this.isChildNode(this.rootDocument, 'Ref') ||
					// not valid syntax but we leave this for the next layer to process
					this.isProperty(this.unhandledStatements) ||
					this.isDeleteProperty(this.unhandledStatements) ||
					this.isChildNode(this.unhandledStatements, 'Name')
				)
			) {
				const token = this.moveToNextToken;
				if (token) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.UNKNOWN,
							token,
							token,
							null,
						),
					);
					this.reportExtraEndStatements();
				}
			}
		};

		while (!this.done) {
			await process();
		}

		if (!this.uri.endsWith('.dtsi')) {
			this.unhandledStatements.nodes.forEach((node) => {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_NAME_IN_ROOT,
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			});

			this.unhandledStatements.properties.forEach((prop) => {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.PROPERTY_MUST_BE_IN_NODE,
						prop.firstToken,
						prop.lastToken,
						prop,
					),
				);
			});

			this.unhandledStatements.deleteProperties.forEach((delProp) => {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE,
						delProp.firstToken,
						delProp.lastToken,
						delProp,
					),
				);
			});
		}

		const allAstItems = this.allAstItems.flatMap((n) => [
			n,
			...n.allDescendants,
		]);
		const allComments = this.cPreprocessorParser.comments;

		if (allComments.length) {
			allAstItems.forEach((ast) => {
				if (ast instanceof DtcBaseNode || ast instanceof DtcProperty) {
					linkAstToComments(ast, allComments);
				}
			});
		}

		if (this.positionStack.length !== 1) {
			/* istanbul ignore next */
			throw new Error('Incorrect final stack size');
		}
	}

	protected processInjectPreProcessorMacros(
		macros: Map<string, MacroRegistryItem>,
	) {
		const startIndex = this.peekIndex();
		let result =
			this.isFunctionCall(macros) ||
			this.processCIdentifier(macros, true, true);
		return this.injectPreProcessorResults(macros, result, startIndex);
	}

	protected injectPreProcessorResults(
		macros: Map<string, MacroRegistryItem>,
		result: CMacroCall | CIdentifier | undefined,
		startIndex: number,
	) {
		let evalResult = result?.resolve(macros);
		if (result && typeof evalResult === 'string') {
			this.injectedMacros.push(result);
			evalResult = sanitizeCExpression(evalResult);
			const uri = `${result.uri}${VIRTUAL_DOC}${result.firstToken.pos.line}:${result.firstToken.pos.col}-${result.lastToken.pos.line}:${result.firstToken.pos.col}`;

			const toRemoveSet = new Set<ASTBase>();
			this.cPreprocessorParser.comments.forEach((c) => {
				if (positionInBetween(result, result.uri, c.range.start)) {
					toRemoveSet.add(c);
				}
			});
			this.cPreprocessorParser.removeComments(toRemoveSet);
			this.injectedMacros.push(result);

			// avoid recursive calls
			if (
				(result instanceof CIdentifier &&
					evalResult.includes(result.name)) ||
				(result instanceof CMacroCall &&
					evalResult.includes(result.functionName.name))
			) {
				return true;
			}

			const lexer = new Lexer(evalResult, uri);
			this.tokens.splice(
				startIndex,
				this.peekIndex() - startIndex,
				...lexer.tokens,
			);
			this.positionStack[this.positionStack.length - 1] = startIndex;
			return true;
		}
	}

	private isRootNodeDefinition(parent: DtcBaseNode): boolean {
		this.enqueueToStack();

		const firstToken = this.moveToNextToken;
		let nextToken = firstToken;
		let expectedToken = LexerToken.FORWARD_SLASH;
		if (!firstToken || !validToken(firstToken, expectedToken)) {
			this.popStack();
			return false;
		}

		nextToken = this.moveToNextToken;
		expectedToken = LexerToken.CURLY_OPEN;
		if (!nextToken || !validToken(nextToken, expectedToken)) {
			this.popStack();
			return false;
		}

		// from this point we can continue an report the expected tokens
		const rootNode = new DtcRootNode();
		rootNode.openScope = nextToken;
		parent.addNodeChild(rootNode);
		this.processNode(rootNode, 'Name');

		const lastToken = this.nodeEnd(rootNode) ?? nextToken;
		rootNode.firstToken = firstToken;
		rootNode.lastToken = lastToken;
		this.mergeStack();
		return true;
	}

	private nodeEnd(dtcNode: DtcBaseNode) {
		const nextToken = this.currentToken;
		if (!validToken(nextToken, LexerToken.CURLY_CLOSE)) {
			const prevToken = this.prevToken;
			if (prevToken) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.CURLY_CLOSE,
						prevToken,
						prevToken,
						dtcNode,
					),
				);
			}

			return this.endStatement(dtcNode, false);
		} else {
			this.moveToNextToken;
		}

		if (this.prevToken?.value === '}') {
			dtcNode.closeScope = this.prevToken;
		}

		return this.endStatement(dtcNode);
	}

	private isNodeEnd() {
		return (
			validToken(this.currentToken, LexerToken.CURLY_CLOSE) ||
			validToken(this.currentToken, LexerToken.SEMICOLON)
		);
	}

	private endStatement(parentStatement: ASTBase, report = true) {
		const currentToken = this.currentToken;
		if (!validToken(currentToken, LexerToken.SEMICOLON)) {
			const token = this.prevToken;
			if (token && report) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.END_STATEMENT,
						token,
						token,
						parentStatement,
					),
				);
				return token;
			}
		}

		this.moveToNextToken;

		this.reportExtraEndStatements();

		return currentToken;
	}

	private reportExtraEndStatements() {
		while (validToken(this.currentToken, LexerToken.SEMICOLON)) {
			const token = this.moveToNextToken;
			if (token) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NO_STATEMENT,
						token,
						token,
						null,
					),
				);
			}
		}
	}

	private processNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		if (this.done) return false;

		let found = false;
		let child = false;

		do {
			while (
				this.processInjectPreProcessorMacros(
					this.cPreprocessorParser.macros,
				)
			) {}

			child =
				this.isChildNode(parent, allow) ||
				this.isProperty(parent) ||
				this.isDeleteNode(parent, allow) ||
				this.isDeleteProperty(parent);

			if (!child && !this.isNodeEnd() && !this.done) {
				const token = this.moveToNextToken;
				if (token) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.UNKNOWN,
							token,
							token,
							null,
						),
					);
					this.reportExtraEndStatements();
				}
			} else {
				if (this.done) {
					break;
				}
			}
			found = found || child;
		} while (!this.isNodeEnd());
		return found;
	}

	private processOptionalLabelAssign(acceptLabelName = false): LabelAssign[] {
		const labels: LabelAssign[] = [];

		// Find all labels before node/property/value.....
		let labelAssign = this.isLabelAssign(acceptLabelName);
		while (labelAssign) {
			labels.push(labelAssign);
			labelAssign = this.isLabelAssign(acceptLabelName);
		}

		return labels;
	}

	private isChildNode(parentNode: DtcBaseNode, allow: AllowNodeRef): boolean {
		this.enqueueToStack();

		let omitIfNoRef: Keyword | undefined;
		if (allow === 'Name') {
			omitIfNoRef = this.isOmitIfNoRefNode();
		}

		const labels = this.processOptionalLabelAssign();

		let name: NodeName | undefined;
		let ref: LabelRef | NodePathRef | undefined;

		const child =
			allow === 'Ref'
				? new DtcRefNode(labels)
				: new DtcChildNode(labels, omitIfNoRef);

		if (allow === 'Ref') {
			this.enqueueToStack();
			ref = this.processNodePathRef(child);

			if (!ref || !validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
				this.popStack();
				ref = undefined;
			} else {
				this.mergeStack();
			}

			ref ??= this.isLabelRef(child);
		} else if (allow === 'Name') {
			name = this.isNodeName();
		}

		if (!ref) {
			if (!name) {
				if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
					// could be property then ....
					this.popStack();
					return false;
				}

				child.firstToken = this.currentToken;

				this._issues.push(
					genSyntaxDiagnostic(
						allow === 'Name'
							? [SyntaxIssue.NODE_NAME]
							: [
									SyntaxIssue.NODE_REF,
									SyntaxIssue.NODE_PATH_REF,
									SyntaxIssue.ROOT_NODE_NAME,
								],
						child.firstToken,
						this.currentToken?.nextToken,
						child,
					),
				);
			}
		}

		let expectedNode = false;
		if (ref && child instanceof DtcRefNode) {
			child.reference = ref;
			expectedNode = true;
		} else if (name && child instanceof DtcChildNode) {
			expectedNode = name.address !== undefined;
			child.name = name;
		}

		if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				const refOrName = ref ?? name;
				if (refOrName)
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.CURLY_OPEN,
							refOrName.firstToken,
							refOrName.lastToken,
							refOrName,
						),
					);
			} else {
				// this could be a property
				this.popStack();
				return false;
			}
		} else {
			child.openScope = this.moveToNextToken;
			// syntax must be a node ....

			let hasChild: boolean = false;
			do {
				hasChild = this.processNode(child, 'Name');
			} while (hasChild);

			const lastToken = this.nodeEnd(child);

			child.lastToken = lastToken;
		}

		parentNode.addNodeChild(child);
		this.mergeStack();
		return true;
	}

	private processNodeAddress(parent: ASTBase): NodeAddress {
		let prevToken = this.prevToken;

		this.enqueueToStack();
		let hexStartPrepend = this.checkConcurrentTokens([
			validateValue('0'),
			validateValue('x', { caseInsensitive: true }),
		]);

		if (hexStartPrepend.length !== 2) {
			hexStartPrepend = [];
			this.popStack();
		} else {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.NODE_ADDRESS_HEX_START,
					hexStartPrepend[0],
					hexStartPrepend[1],
					parent,
					{ severity: DiagnosticSeverity.Warning },
				),
			);
			prevToken = hexStartPrepend.at(-1);
			this.mergeStack();
		}

		const addressValid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT, LexerToken.HEX, LexerToken.UNDERSCORE].map(
				validateToken,
			),
		);

		const hexTo32BitArray = (hexStr: string) => {
			// Pad the string to make its length a multiple of 8
			if (hexStr.length % 8 !== 0) {
				hexStr = hexStr.padStart(Math.ceil(hexStr.length / 8) * 8, '0');
			}

			const result = [];
			for (let i = 0; i < hexStr.length; i += 8) {
				const chunk = hexStr.slice(i, i + 8);
				result.push(parseInt(chunk, 16) >>> 0); // Ensure 32-bit unsigned
			}

			return result;
		};

		const address = addressValid.length
			? hexTo32BitArray(
					addressValid
						.filter((v) => v.value !== '_')
						.map((v) => v.value)
						.join(''),
				)
			: [NaN];

		if (prevToken) {
			if (address.some((n) => Number.isNaN(n))) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_ADDRESS,
						prevToken,
						prevToken,
						parent,
					),
				);
			} else if (
				!Number.isNaN(address) &&
				!adjacentTokens(prevToken, addressValid[0])
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						prevToken,
						addressValid[0],
						parent,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
			}
		}

		if (this.currentToken?.value.toUpperCase() === 'ULL') {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.NODE_ADDRESS_ENDS_ULL,
					this.currentToken,
					this.currentToken,
					parent,
					{ severity: DiagnosticSeverity.Warning },
				),
			);
			this.moveToNextToken;
		}

		const nodeAddress = new NodeAddress(
			address,
			createTokenIndex(
				hexStartPrepend.at(0) ?? addressValid[0] ?? this.prevToken,
				this.prevToken,
			),
		);

		return nodeAddress;
	}

	private processNodeAddresses(
		nodeName: NodeName,
	): NodeAddress[] | undefined {
		this.enqueueToStack();

		const atValid = this.checkConcurrentTokens([
			validateToken(LexerToken.AT),
		]);
		if (atValid.length) {
			if (!adjacentTokens(nodeName.lastToken, atValid[0])) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						nodeName.lastToken,
						atValid[0],
						nodeName,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
			}

			const addresses: NodeAddress[] = [];
			const consumeAllAddresses = () => {
				addresses.push(this.processNodeAddress(nodeName));

				if (validToken(this.currentToken, LexerToken.COMMA)) {
					if (
						this.prevToken &&
						!adjacentTokens(this.prevToken, this.currentToken)
					) {
						this._issues.push(
							genSyntaxDiagnostic(
								SyntaxIssue.WHITE_SPACE,
								this.prevToken,
								this.currentToken,
								nodeName,
								{ inclusiveStart: false, inclusiveEnd: false },
							),
						);
					}
					this.moveToNextToken;
					consumeAllAddresses();
				}
			};

			consumeAllAddresses();

			const unknownTokenStart = this.currentToken;
			while (
				!validToken(this.currentToken, LexerToken.CURLY_OPEN) &&
				!validToken(this.currentToken, LexerToken.SEMICOLON) &&
				!validToken(this.currentToken, LexerToken.CURLY_CLOSE) &&
				sameLine(this.currentToken, addresses.at(-1)?.lastToken)
			) {
				this.moveToNextToken;
			}

			if (unknownTokenStart && unknownTokenStart !== this.currentToken) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.UNKNOWN_NODE_ADDRESS_SYNTAX,
						unknownTokenStart,
						this.currentToken,
						nodeName,
					),
				);
				const nodeAddress = new NodeAddress(
					[],
					createTokenIndex(unknownTokenStart, this.prevToken),
				);
				addresses.push(nodeAddress);
			}

			this.mergeStack();
			return addresses;
		}

		this.popStack();
		return;
	}

	private isNodeName(): NodeName | undefined {
		this.enqueueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[
				LexerToken.DIGIT,
				LexerToken.LETTERS,
				LexerToken.COMMA,
				LexerToken.PERIOD,
				LexerToken.UNDERSCORE,
				LexerToken.ADD_OPERATOR,
				LexerToken.NEG_OPERATOR,
			].map(validateToken),
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		const node = new NodeName(
			name,
			createTokenIndex(valid[0], valid.at(-1)),
		);
		const addresses = this.processNodeAddresses(node);
		node.address = addresses;

		if (!startsWithLetter(name)) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.NAME_NODE_NAME_START,
					node.firstToken,
					node.lastToken,
					node,
				),
			);
		}

		this.mergeStack();
		return node;
	}

	private isPropertyName(): PropertyName | undefined {
		this.enqueueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[
				LexerToken.DIGIT,
				LexerToken.LETTERS,
				LexerToken.COMMA,
				LexerToken.PERIOD,
				LexerToken.UNDERSCORE,
				LexerToken.ADD_OPERATOR,
				LexerToken.NEG_OPERATOR,
				LexerToken.QUESTION_MARK,
				LexerToken.HASH,
			].map(validateToken),
		);

		if (!valid.length) {
			this.popStack();
			return;
		}
		const node = new PropertyName(
			valid.map((v) => v.value).join(''),
			createTokenIndex(valid[0], valid.at(-1)),
		);
		this.mergeStack();
		return node;
	}

	private isLabelName(): Label | undefined {
		this.enqueueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
				validateToken,
			),
		);

		if (!valid.length) {
			this.popStack();
			return undefined;
		}

		if (!startsWithLetter(valid?.[0].value)) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		const node = new Label(
			name,
			createTokenIndex(valid[0], valid[valid.length - 1]),
		);
		this.mergeStack();
		return node;
	}

	private isLabelAssign(acceptLabelName: boolean): LabelAssign | undefined {
		this.enqueueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
				validateToken,
			),
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		if (!startsWithLetter(valid?.[0].value)) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		const token = this.currentToken;
		const hasColon = token && validToken(token, LexerToken.COLON);
		const node = new LabelAssign(
			new Label(name, createTokenIndex(valid[0], valid.at(-1))),
			createTokenIndex(valid[0], hasColon ? token : valid.at(-1)),
		);

		if (!hasColon) {
			if (acceptLabelName) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.LABEL_ASSIGN_MISSING_COLON,
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			} else {
				this.popStack();
				return;
			}
		} else {
			const lastNameToken = valid.at(-1);
			if (
				lastNameToken &&
				(token.pos.line !== node.firstToken.pos.line ||
					token.pos.col !== lastNameToken.pos.colEnd)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						lastNameToken,
						token,
						node,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
			}
			this.moveToNextToken;
		}

		this.mergeStack();
		return node;
	}

	private isProperty(parent: DtcBaseNode): boolean {
		this.enqueueToStack();

		const labels = this.processOptionalLabelAssign();

		const propertyName = this.isPropertyName();

		if (!propertyName) {
			this.popStack();
			return false;
		}

		if (
			validToken(this.currentToken, LexerToken.CURLY_OPEN) ||
			validToken(this.currentToken, LexerToken.AT)
		) {
			// this is a node not a property
			this.popStack();
			return false;
		}

		const node = new DtcProperty(propertyName, labels);

		let result: PropertyValues | undefined;
		if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
			node.assignOperatorToken = this.moveToNextToken;
			result = this.processValue(parent);

			if (!result?.values.filter((v) => !!v).length) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.VALUE,
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			}
			node.values = result ?? null;
		} else {
			node.values = undefined;
		}

		const lastToken = this.endStatement(node);

		// create property object
		node.lastToken = lastToken;

		parent.addNodeChild(node);

		this.mergeStack();
		return true;
	}

	private isDtsDocumentVersion(): boolean {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('d'),
			validateValue('ts'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('v'),
			validateValue('1'),
		]);

		if (valid.length !== 6) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;

		const keyword = new Keyword();
		keyword.firstToken = firstToken;
		const node = new DtsDocumentVersion(keyword);
		this.others.push(node);

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			keyword.lastToken = valid.at(-1);
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_FORWARD_SLASH_END,
					node.firstToken,
					node.lastToken,
					node,
				),
			);
			this.mergeStack();
			return true;
		} else {
			token = this.moveToNextToken;
		}

		keyword.lastToken = token;

		node.lastToken = this.endStatement(node);
		this.mergeStack();
		return true;
	}

	private isMemreserve(): boolean {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('memreserve'),
		]);

		if (valid.length !== 2) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword();
		keyword.firstToken = valid[0];

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;

		if (validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			token = this.moveToNextToken;
			keyword.lastToken = token;
		} else {
			keyword.lastToken = valid.at(-1);
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_FORWARD_SLASH_END,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		}

		const startValue: NumberValue | undefined =
			this.processHex() || this.processDec();
		const endValue: NumberValue | undefined =
			startValue && (this.processHex() || this.processDec());

		const node = new DtsMemreserveNode(keyword, startValue, endValue);
		this.others.push(node);

		if (!startValue) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_START_ADDRESS,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		}

		if (!endValue) {
			const issueAst = startValue ?? keyword;
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_END_ADDRESS,
					issueAst.firstToken,
					issueAst.lastToken,
					node,
				),
			);
		}

		node.lastToken = this.endStatement(node);
		this.mergeStack();
		return true;
	}

	private isPlugin(): boolean {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('plugin'),
			validateToken(LexerToken.FORWARD_SLASH),
		]);

		if (valid.length !== 3) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword(createTokenIndex(valid[0], valid.at(-1)));

		keyword.lastToken = this.endStatement(keyword);
		this.mergeStack();
		this.others.push(keyword);
		return true;
	}

	private processBits(): DtsBitsNode | undefined {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('b'),
			validateValue('its'),
		]);

		if (valid.length !== 3) {
			this.popStack();
			return;
		}

		const keyword = new Keyword();
		keyword.firstToken = valid[0];

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;

		if (validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			token = this.moveToNextToken;
			keyword.lastToken = token;
		} else {
			keyword.lastToken = valid.at(-1);
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_FORWARD_SLASH_END,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		}

		const bitsSize: NumberValue | undefined = this.processDec();

		const node = new DtsBitsNode(keyword, bitsSize);
		this.others.push(node);

		if (!bitsSize) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_BITS_SIZE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		} else if (
			bitsSize.value !== 8 &&
			bitsSize.value !== 16 &&
			bitsSize.value !== 32 &&
			bitsSize.value !== 64
		) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.INVALID_BITS_SIZE,
					bitsSize.firstToken,
					bitsSize.lastToken,
					bitsSize,
				),
			);
		}

		this._issues.push(
			genSyntaxDiagnostic(
				SyntaxIssue.BITS_NON_OFFICIAL_SYNTAX,
				node.firstToken,
				node.lastToken,
				node,
				{ severity: DiagnosticSeverity.Warning },
			),
		);

		this.mergeStack();
		return node;
	}

	private isOmitIfNoRefNode(): Keyword | undefined {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('omit'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('if'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('no'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('ref'),
			validateToken(LexerToken.FORWARD_SLASH),
		]);

		if (valid.length !== 9) {
			this.popStack();
			return;
		}

		const keyword = new Keyword(createTokenIndex(valid[0], valid.at(-1)));
		this.mergeStack();
		return keyword;
	}

	private isDeleteNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('d'),
			validateValue('e'),
			validateValue('lete', { allowPartial: true }),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('node', { allowPartial: true }),
		]);

		if (!valid.length) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;
		const keyword = new Keyword();
		keyword.firstToken = firstToken;

		if (
			valid.length === 1 &&
			!validToken(this.currentToken, LexerToken.CURLY_OPEN)
		) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.DELETE_INCOMPLETE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
			keyword.lastToken = valid.at(-1);
			const node = new DeleteNode(keyword);
			parent.addNodeChild(node);
			this.mergeStack();
			return true;
		}

		const stringValue = valid.map((t) => t.value ?? '').join('');

		if (
			!'/delete-node/'.startsWith(stringValue) ||
			stringValue.endsWith('-')
		) {
			this.popStack();
			return false;
		}

		keyword.lastToken = valid.at(-1);
		if ('/delete-node' !== stringValue) {
			this._issues.push(
				genSyntaxDiagnostic(
					stringValue.startsWith('/delete-n')
						? SyntaxIssue.DELETE_NODE_INCOMPLETE
						: SyntaxIssue.DELETE_INCOMPLETE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		} else {
			if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.MISSING_FORWARD_SLASH_END,
						keyword.firstToken,
						keyword.lastToken,
						keyword,
					),
				);
			} else {
				token = this.moveToNextToken;
				keyword.lastToken = token;
			}
		}
		const node = new DeleteNode(keyword);

		if (sameLine(keyword.lastToken, firstToken)) {
			const nodePathRef = this.processNodePathRef(parent);
			if (nodePathRef && allow === 'Name') {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_NAME,
						nodePathRef.firstToken,
						nodePathRef.lastToken,
						nodePathRef,
					),
				);
			}

			const labelRef = nodePathRef ? undefined : this.isLabelRef(parent);
			if (labelRef && allow === 'Name') {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_NAME,
						labelRef.firstToken,
						labelRef.lastToken,
						labelRef,
					),
				);
			}

			const nodeName =
				nodePathRef || labelRef ? undefined : this.isNodeName();
			if (nodeName && allow === 'Ref') {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_REF,
						nodeName.firstToken,
						nodeName.lastToken,
						nodeName,
					),
				);
			}

			if (!nodePathRef && !nodeName && !labelRef) {
				this._issues.push(
					genSyntaxDiagnostic(
						[SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF],
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			}
			node.nodeNameOrRef = nodePathRef ?? labelRef ?? nodeName ?? null;
		} else {
			if (allow === 'Name') {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_NAME,
						keyword.firstToken,
						keyword.lastToken,
						keyword,
					),
				);
			} else if (allow === 'Ref') {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.NODE_REF,
						keyword.firstToken,
						keyword.lastToken,
						keyword,
					),
				);
			}
		}
		const lastToken = this.endStatement(node);

		node.lastToken = lastToken;
		parent.addNodeChild(node);
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('d'),
			validateValue('e'),
			validateValue('lete', { allowPartial: true }),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('property', { allowPartial: true }),
		]);

		if (!valid.length) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];

		let token: Token | undefined = firstToken;
		const keyword = new Keyword();
		keyword.firstToken = firstToken;

		if (
			valid.length === 1 &&
			!validToken(this.currentToken, LexerToken.CURLY_OPEN)
		) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.DELETE_INCOMPLETE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
			keyword.lastToken = valid.at(-1);
			const node = new DeleteProperty(keyword);
			parent.addNodeChild(node);
			this.mergeStack();
			return true;
		}

		const stringValue = valid.map((t) => t.value ?? '').join('');

		if (
			!'/delete-property/'.startsWith(stringValue) ||
			stringValue.endsWith('-')
		) {
			this.popStack();
			return false;
		}

		keyword.lastToken = valid.at(-1);
		if ('/delete-property' !== stringValue) {
			this._issues.push(
				genSyntaxDiagnostic(
					stringValue.startsWith('/delete-p')
						? SyntaxIssue.DELETE_PROPERTY_INCOMPLETE
						: SyntaxIssue.DELETE_INCOMPLETE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		} else {
			if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.MISSING_FORWARD_SLASH_END,
						keyword.firstToken,
						keyword.lastToken,
						keyword,
					),
				);
			} else {
				token = this.moveToNextToken;
				keyword.lastToken = token;
			}
		}

		const node = new DeleteProperty(keyword);

		if (sameLine(keyword.lastToken, firstToken)) {
			const propertyName = this.isPropertyName();
			if (!propertyName) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.PROPERTY_NAME,
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			}

			node.propertyName = propertyName ?? null;
		} else {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.PROPERTY_NAME,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
		}

		const lastToken = this.endStatement(node);
		node.lastToken = lastToken;
		parent.addNodeChild(node);

		this.mergeStack();
		return true;
	}

	private isNodePathRef(parent: ASTBase): PropertyValue | undefined {
		this.enqueueToStack();
		const startLabels = this.processOptionalLabelAssign(true);

		const nodePathRef = this.processNodePathRef(parent);
		if (!nodePathRef) {
			this.popStack();
			return;
		}

		const endLabels: LabelAssign[] = [];
		if (
			this.currentToken &&
			this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
		)
			endLabels.push(...this.processOptionalLabelAssign(true));

		const node = new PropertyValue(startLabels, nodePathRef, endLabels);
		this.mergeStack();
		return node;
	}

	private processValue(parent: ASTBase): PropertyValues | undefined {
		this.enqueueToStack();

		const getValues = (): (PropertyValue | null)[] => {
			const getValue = () => {
				return (
					(this.processStringValue() ||
						this.isNodePathRef(parent) ||
						this.isLabelRefValue(parent) ||
						this.arrayValues(parent) ||
						this.processByteStringValue() ||
						this.isExpressionValue(parent)) ??
					null
				);
			};
			const value = getValue();

			if (!value) {
				return [];
			}

			const values: (PropertyValue | null)[] = [value];
			while (!validToken(this.currentToken, LexerToken.SEMICOLON)) {
				const start = this.prevToken;
				const end = this.currentToken;
				let valueSeparator: Token | undefined;

				const shouldHaveValue = validToken(
					this.currentToken,
					LexerToken.COMMA,
				);
				if (shouldHaveValue) {
					valueSeparator = this.currentToken;

					this.moveToNextToken;
				} else if (!sameLine(this.prevToken, this.currentToken)) {
					break;
				}
				const next = getValue();
				if (end && next === null && shouldHaveValue) {
					const node = new ASTBase(
						createTokenIndex(end, this.currentToken),
					);
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.VALUE,
							node.firstToken,
							node.lastToken,
							node,
						),
					);
				}
				if (!shouldHaveValue && next === null) {
					break;
				}
				if (start && !shouldHaveValue && next) {
					const node = new ASTBase(createTokenIndex(start));
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.MISSING_COMMA,
							node.firstToken,
							node.lastToken,
							node,
						),
					);
				}

				const prevValue = values.at(-1);
				if (prevValue) {
					prevValue.nextValueSeparator ??= valueSeparator;
				}

				values.push(next);
			}

			return values;
		};

		const values = getValues();

		if (values.length === 0) {
			this.popStack();
			return;
		}

		this.mergeStack();
		const node = new PropertyValues(values);
		return node;
	}

	private processStringValue(): PropertyValue | undefined {
		this.enqueueToStack();

		const startLabels = this.processOptionalLabelAssign(true);

		const str = this.consumeAnyConcurrentTokens([
			validateToken(LexerToken.STRING),
		]);
		if (!str.length) {
			this.popStack();
			return;
		}

		if (str.some((token) => token.value === undefined)) {
			/* istanbul ignore next */
			throw new Error('Token must have value');
		}

		const value = str.map((s) => s.value).join('\n');
		let trimmedValue = value;

		const endsWithQuote = ['"', "'"].some((c) => trimmedValue.endsWith(c));
		if (endsWithQuote) {
			trimmedValue = trimmedValue.slice(1, -1);
		}
		const propValue = new StringValue(
			trimmedValue,
			createTokenIndex(str[0], str.at(-1)),
		);

		if (!endsWithQuote) {
			this._issues.push(
				genSyntaxDiagnostic(
					value.startsWith('"')
						? SyntaxIssue.DOUBLE_QUOTE
						: SyntaxIssue.SINGLE_QUOTE,
					propValue.firstToken,
					propValue.lastToken,
					propValue,
				),
			);
		}

		let endLabels: LabelAssign[] = [];
		if (
			this.currentToken &&
			this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
		)
			endLabels = this.processOptionalLabelAssign(true);

		const node = new PropertyValue(startLabels, propValue, endLabels);
		this.mergeStack();
		return node;
	}

	private arrayValues(parent: ASTBase): PropertyValue | undefined {
		this.enqueueToStack();

		const startLabels = this.processOptionalLabelAssign(true);
		const bits = this.processBits();

		const openBracket = this.currentToken;
		if (!validToken(openBracket, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		} else {
			this.moveToNextToken;
		}

		const value = this.processArrayValues(parent) ?? null;
		value.openBracket = openBracket;

		const endLabels1 = this.processOptionalLabelAssign(true) ?? [];

		const node = new PropertyValue(startLabels, value, endLabels1, bits);

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.GT_SYM,
					node.firstToken,
					node.lastToken,
					node,
				),
			);
		} else {
			const t = this.moveToNextToken;
			if (value) {
				value.closeBracket = t;
			}
		}

		let endLabels2: LabelAssign[] = [];
		if (
			this.currentToken &&
			this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
		)
			endLabels2 = this.processOptionalLabelAssign(true);

		this.mergeStack();

		node.endLabels.push(...endLabels2);

		node.firstToken = openBracket;
		node.lastToken = this.prevToken;
		return node;
	}

	private processByteStringValue(): PropertyValue | undefined {
		this.enqueueToStack();

		const startLabels = this.processOptionalLabelAssign(true);

		const firstToken = this.moveToNextToken;
		const openBracket = firstToken;
		if (!validToken(openBracket, LexerToken.SQUARE_OPEN)) {
			this.popStack();
			return;
		}

		const numberValues = this.processLabeledValue(() =>
			this.processHexString(),
		);

		const endLabels = this.processOptionalLabelAssign(true) ?? [];

		numberValues.forEach((value) => {
			let len = 0;
			if (
				value.value &&
				value.value.firstToken === value.value.lastToken
			) {
				len = value.value.firstToken.pos.len;
			}

			if (len % 2 !== 0) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.BYTESTRING_EVEN,
						value.firstToken,
						value.lastToken,
						value,
					),
				);
			}
		});

		const byteString = new ByteStringValue(numberValues ?? []);
		byteString.openBracket = openBracket;
		if (byteString.values.length === 0) {
			byteString.firstToken = firstToken;
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.BYTESTRING,
					byteString.firstToken,
					byteString.lastToken,
					byteString,
					{ severity: DiagnosticSeverity.Information },
				),
			);
		}

		const node = new PropertyValue(startLabels, byteString, endLabels);

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.SQUARE_CLOSE,
					node.firstToken,
					node.lastToken,
					node,
				),
			);
		} else {
			byteString.closeBracket = this.moveToNextToken;
		}

		let endLabels2: LabelAssign[] = [];
		if (
			this.currentToken &&
			this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
		)
			endLabels2 = this.processOptionalLabelAssign(true);

		this.mergeStack();
		node.endLabels.push(...endLabels2);
		node.firstToken = firstToken;
		byteString.lastToken = this.prevToken;
		return node;
	}

	private processLabeledValue<T extends ASTBase>(
		processValue: () => LabeledValue<T> | undefined,
	): LabeledValue<T>[] {
		this.enqueueToStack();

		let value = processValue();
		let result: LabeledValue<T>[] = [];

		if (!value) {
			this.popStack();
			return [];
		}

		while (value) {
			result.push(value);
			value = processValue();
		}

		if (result.length) {
			const nextValue = processValue();
			if (nextValue) {
				result.push(nextValue);
			}
		}

		this.mergeStack();
		return result;
	}

	private processArrayValues(parent: ASTBase): ArrayValues {
		this.enqueueToStack();

		const result = this.processLabeledValue(
			():
				| LabeledValue<
						NumberValue | LabelRef | NodePathRef | Expression
				  >
				| undefined => {
				const action = () =>
					this.processRefValue(parent, false) ||
					this.processLabeledHex(false) ||
					this.processLabeledDec(false) ||
					this.processLabeledExpression(true, false, parent);

				const startIndex = this.peekIndex();
				const result = action();

				// we should not get any expressions that are string... so in this case we resolve file
				// and inject and reparse
				if (
					result &&
					!this.cPreprocessorParser.optimizeForFormatting &&
					((result.value instanceof CMacroCall &&
						this.cPreprocessorParser.macros.has(
							result.value.functionName.name,
						)) ||
						(result.value instanceof CIdentifier &&
							this.cPreprocessorParser.macros.has(
								result.value.name,
							))) &&
					typeof result.value.evaluate(
						this.cPreprocessorParser.macros,
					) === 'string'
				) {
					this.injectPreProcessorResults(
						this.cPreprocessorParser.macros,
						result.value,
						startIndex,
					);
					return action();
				}
				return result;
			},
		);

		const node = new ArrayValues(result);
		if (result.length === 0) {
			node.firstToken = this.currentToken;
		}

		this.mergeStack();
		return node;
	}

	private processLabeledHex(
		acceptLabelName: boolean,
	): LabeledValue<NumberValue> | undefined {
		this.enqueueToStack();

		const labels = this.processOptionalLabelAssign(acceptLabelName);
		const numberValue = this.processHex();
		if (!numberValue) {
			this.popStack();
			return;
		}

		const node = new LabeledValue(numberValue, labels);
		this.mergeStack();
		return node;
	}

	private processHexString(): LabeledValue<NumberValue> | undefined {
		this.enqueueToStack();

		const labels = this.processOptionalLabelAssign(false);
		const valid = this.checkConcurrentTokens(
			[LexerToken.HEX, LexerToken.HEX].map(validateToken),
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(valid.map((v) => v.value).join(''), 16);
		const numberValue = new NumberValue(
			num,
			createTokenIndex(valid[0], valid.at(-1)),
			16,
		);

		const node = new LabeledValue(numberValue, labels);
		this.mergeStack();
		return node;
	}

	private processLabeledDec(
		acceptLabelName: boolean,
	): LabeledValue<NumberValue> | undefined {
		this.enqueueToStack();

		const labels = this.processOptionalLabelAssign(acceptLabelName);

		const numberValue = this.processDec();
		if (!numberValue) {
			this.popStack();
			return;
		}
		const node = new LabeledValue(numberValue, labels);
		this.mergeStack();
		return node;
	}

	private processLabeledExpression(
		checkForLabels = true,
		acceptLabelName = checkForLabels,
		parent: ASTBase,
	): LabeledValue<Expression> | undefined {
		this.enqueueToStack();

		let labels: LabelAssign[] = [];
		if (checkForLabels) {
			labels = this.processOptionalLabelAssign(acceptLabelName);
		}

		const expression = this.processExpression(
			this.cPreprocessorParser.macros,
			parent,
		);

		if (!expression) {
			this.popStack();
			return;
		}

		const node = new LabeledValue(expression, labels);
		this.mergeStack();
		return node;
	}

	private isExpressionValue(parent: ASTBase): PropertyValue | undefined {
		this.enqueueToStack();
		const startLabels = this.processOptionalLabelAssign(false);

		const expression = this.processExpression(
			this.cPreprocessorParser.macros,
			parent,
		);

		if (!expression) {
			this.popStack();
			return;
		}

		const endLabels = this.processOptionalLabelAssign(true);

		const node = new PropertyValue(startLabels, expression, endLabels);

		this.mergeStack();
		return node;
	}

	private isLabelRef(parent: ASTBase): LabelRef | undefined {
		this.enqueueToStack();
		const ampersandToken = this.currentToken;
		if (
			!ampersandToken ||
			!validToken(ampersandToken, LexerToken.AMPERSAND)
		) {
			this.popStack();
			return;
		} else {
			this.moveToNextToken;
		}

		const labelName = this.isLabelName();
		if (!labelName) {
			const node = new LabelRef(null);
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.LABEL_NAME,
					ampersandToken,
					ampersandToken,
					parent,
				),
			);
			node.firstToken = ampersandToken;
			this.mergeStack();
			return node;
		}

		if (
			ampersandToken &&
			(labelName.firstToken.pos.line !== ampersandToken.pos.line ||
				labelName.firstToken.pos.col !== ampersandToken.pos.colEnd)
		) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.WHITE_SPACE,
					ampersandToken,
					labelName.firstToken,
					parent,
					{ inclusiveStart: false, inclusiveEnd: false },
				),
			);
		}

		const node = new LabelRef(labelName);
		node.firstToken = ampersandToken;
		this.mergeStack();
		return node;
	}

	private isLabelRefValue(parent: ASTBase): PropertyValue | undefined {
		this.enqueueToStack();

		const startLabels = this.processOptionalLabelAssign(true);

		const labelRef = this.isLabelRef(parent);

		if (!labelRef) {
			this.popStack();
			return;
		}

		let endLabels: LabelAssign[] = [];
		if (
			this.currentToken &&
			this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
		)
			endLabels = this.processOptionalLabelAssign(true);

		const node = new PropertyValue(startLabels, labelRef, endLabels);
		this.mergeStack();
		return node;
	}

	private processRefValue(
		parent: ASTBase,
		acceptLabelName: boolean,
	): LabeledValue<LabelRef | NodePathRef> | undefined {
		this.enqueueToStack();
		const labels = this.processOptionalLabelAssign(acceptLabelName);
		const firstToken = this.currentToken;
		if (!firstToken || !validToken(firstToken, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		const nodePath = this.processNodePathRef(parent);

		if (nodePath !== undefined) {
			const node = new LabeledValue(nodePath, labels);
			this.mergeStack();
			return node;
		}

		const labelRef = this.isLabelRef(parent);
		if (labelRef === undefined) {
			this._issues.push(
				genSyntaxDiagnostic(
					[SyntaxIssue.LABEL_NAME, SyntaxIssue.NODE_PATH],
					firstToken,
					firstToken,
					parent,
				),
			);

			const node = new LabeledValue<LabelRef>(null, labels);
			node.firstToken = labels.at(0)?.firstToken ?? firstToken;
			this.mergeStack();
			return node;
		}

		const node = new LabeledValue(labelRef, labels);
		node.firstToken = labels.at(0)?.firstToken ?? firstToken;
		this.mergeStack();
		return node;
	}

	private processNodePath(
		first = true,
		nodePath = new NodePath(),
	): NodePath | undefined {
		this.enqueueToStack();

		let firstToken: Token | undefined;

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			if (!first) {
				this.popStack();
				return;
			}
			if (this.prevToken) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.FORWARD_SLASH_START_PATH,
						this.prevToken,
						this.prevToken,
						nodePath,
					),
				);
			}
		} else {
			firstToken = this.moveToNextToken;
		}

		const nodeName = this.isNodeName();
		const token = firstToken ?? this.prevToken;
		if (!nodeName && token && !first) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.NODE_NAME,
					token,
					token,
					nodePath,
				),
			);
		}

		if (!first || nodeName) {
			nodePath.addPath(
				nodeName ?? null,
				firstToken
					? new ASTBase(createTokenIndex(firstToken))
					: undefined,
			);
		} else if (first && !nodeName && firstToken) {
			nodePath.addPath(new NodeName('/', createTokenIndex(firstToken)));
			nodePath.firstToken = firstToken;
		}

		if (first && !firstToken && nodePath.children.length === 0) {
			this.mergeStack();
			return undefined;
		}

		this.processNodePath(false, nodePath);

		this.mergeStack();
		return nodePath;
	}

	private processNodePathRef(parent: ASTBase): NodePathRef | undefined {
		this.enqueueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		const beforePath = this.moveToNextToken;
		token = beforePath;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			// might be a node ref such as &nodeLabel
			this.popStack();
			return;
		}

		if (firstToken && !adjacentTokens(firstToken, beforePath)) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.WHITE_SPACE,
					firstToken,
					beforePath,
					parent,
					{ inclusiveStart: false, inclusiveEnd: false },
				),
			);
		}

		// now we must have a valid path
		// /soc/node/node2@223/....
		const nodePath = this.processNodePath();

		const node = new NodePathRef(nodePath ?? null);

		const lastToken = this.currentToken ?? this.prevToken;
		const afterPath = lastToken;

		nodePath?.children.forEach((p, i) => {
			if (
				i === nodePath?.children.length - 1 &&
				p &&
				afterPath &&
				!adjacentTokens(p.lastToken, afterPath)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						p.lastToken,
						afterPath,
						parent,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
				return;
			}
			if (
				i === 0 &&
				beforePath &&
				!adjacentTokens(beforePath, p?.firstToken)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						beforePath,
						p?.firstToken,
						parent,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
				return;
			}
			const nextPart = nodePath?.children[i + 1];
			if (
				p &&
				nextPart &&
				!adjacentTokens(p.lastToken, nextPart.firstToken)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.WHITE_SPACE,
						p.lastToken,
						nextPart?.firstToken,
						parent,
						{ inclusiveStart: false, inclusiveEnd: false },
					),
				);
			}
		});

		if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
			if (this.prevToken) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.CURLY_CLOSE,
						this.prevToken,
						this.prevToken,
						parent,
					),
				);
			}
		} else {
			this.moveToNextToken;
		}

		node.firstToken = firstToken;
		node.lastToken = lastToken ?? this.prevToken;

		this.mergeStack();
		return node;
	}

	get includes() {
		return this.allAstItems.filter(
			(i) => i instanceof Include,
		) as Include[];
	}

	get allAstItems(): ASTBase[] {
		return [
			...this.cPreprocessorParser.allAstItems,
			...this.rootDocument.children,
			...this.others,
			...this.unhandledStatements.properties,
			...this.unhandledStatements.deleteProperties,
			...this.unhandledStatements.nodes,
		];
	}

	buildSemanticTokens(tokensBuilder: SemanticTokensBuilder, uri: string) {
		const result: {
			line: number;
			char: number;
			length: number;
			tokenType: number;
			tokenModifiers: number;
		}[] = [];

		this.injectedMacros.forEach((a) => {
			a.buildSemanticTokens((...args) =>
				BaseParser.push(...args, uri, result),
			);
		});

		super.buildSemanticTokens(tokensBuilder, uri, result);
	}
}
