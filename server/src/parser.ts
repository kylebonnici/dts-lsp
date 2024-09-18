import {
	DiagnosticSeverity,
	DocumentSymbol,
	SemanticTokensBuilder,
} from 'vscode-languageserver';
import { Issue, LexerToken, SyntaxIssue, Token, TokenIndexes } from './types';
import { getTokenModifiers, getTokenTypes, toRange } from './helpers';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRootNode,
	DtcRefNode,
	NodeName,
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
import { Comment } from './ast/dtc/comment';
import { ArrayValues } from './ast/dtc/values/arrayValue';
import { LabledValue } from './ast/dtc/values/labledValue';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { Operator, OperatorType } from './ast/cPreprocessors/operator';
import { ComplexExpression, Expression } from './ast/cPreprocessors/expression';
import { FunctionCall } from './ast/cPreprocessors/functionCall';
import { Include, IncludePath } from './ast/cPreprocessors/include';

type AllowNodeRef = 'Ref' | 'Name';

export class Parser {
	others: ASTBase[] = [];
	includes: ASTBase[] = [];
	rootDocument = new DtcBaseNode();
	positionStack: number[] = [];
	issues: Issue<SyntaxIssue>[] = [];
	unhandledStaments = new DtcRootNode();

	constructor(private tokens: Token[], uri: string) {
		this.rootDocument.uri = uri;
		this.parse();
	}

	get done() {
		return this.peekIndex() >= this.tokens.length;
	}

	private cleanUpComments() {
		const tokensUsed: number[] = [];
		for (let i = 0; i < this.tokens.length; i++) {
			const result = Parser.processComments(this.tokens, i);
			if (result) {
				i = result.index;
				tokensUsed.push(...result.tokenUsed);
				this.others.push(...result.comments);
			}
		}
		tokensUsed.reverse().forEach((i) => this.tokens.splice(i, 1));
	}

	private parse() {
		this.cleanUpComments();
		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		const process = () => {
			if (
				!(
					this.isInclude() ||
					this.isDtsDocumentVersion() ||
					this.isRootNodeDefinition(this.rootDocument) ||
					this.isDeleteNode(this.rootDocument, 'Ref') ||
					// not valid syntax but we leave this for the next layer to proecess
					this.isProperty(this.unhandledStaments) ||
					this.isDeleteProperty(this.unhandledStaments) ||
					// Valid use case
					this.isChildNode(this.rootDocument, 'Ref')
				)
			) {
				const node = new ASTBase();
				const token = this.moveToNextToken;
				node.tokenIndexes = { start: token, end: token };
				this.issues.push(this.genIssue(SyntaxIssue.UNKNOWN, node));
				this.reportExtraEndStaments();
			}
		};

		while (!this.done) {
			process();
		}

		if (this.positionStack.length !== 1) {
			throw new Error('Incorrect final stack size');
		}
	}

	private static processComments(tokens: Token[], index: number) {
		const tokenUsed: number[] = [];

		const move = () => {
			tokenUsed.push(index++);
			return tokens[index];
		};

		const currentToken = () => {
			return tokens[index];
		};

		const prevToken = () => {
			return tokens[index - 1];
		};

		const firstToken = currentToken();
		let token = firstToken;
		if (!firstToken || !validToken(firstToken, LexerToken.FORWARD_SLASH)) {
			return;
		}

		token = move();

		if (
			!validToken(token, LexerToken.MULTI_OPERATOR) ||
			firstToken.pos.line !== token.pos.line ||
			firstToken.pos.col + 1 !== token.pos.col
		) {
			return;
		}

		const isEndComment = (): boolean => {
			if (!validToken(prevToken(), LexerToken.MULTI_OPERATOR)) {
				return false;
			}

			if (
				!validToken(currentToken(), LexerToken.FORWARD_SLASH) ||
				prevToken()?.pos.line !== currentToken()?.pos.line ||
				prevToken()?.pos.col + 1 !== currentToken()?.pos.col
			) {
				return false;
			}

			return true;
		};

		// we have a comment start
		let lastLine = token.pos.line;
		let start = firstToken;
		const comments: Comment[] = [];
		token = move();
		do {
			if (currentToken()?.pos.line !== lastLine) {
				const node = new Comment();
				node.tokenIndexes = { start, end: prevToken() };
				comments.push(node);

				lastLine = currentToken().pos.line ?? 0;

				start = currentToken();
			}
			token = move();
		} while (index < tokens.length && !isEndComment());

		const node = new Comment();
		node.tokenIndexes = { start, end: currentToken() };
		comments.push(node);

		move();
		return {
			comments,
			tokenUsed,
			index: index - 1,
		};
	}

	private isRootNodeDefinition(parent: DtcBaseNode): boolean {
		this.enqueToStack();

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
		parent.addNodeChild(rootNode);
		this.processNode(rootNode, 'Name');

		const lastToken = this.nodeEnd(rootNode) ?? nextToken;
		rootNode.tokenIndexes = { start: firstToken, end: lastToken };
		this.mergeStack();
		return true;
	}

	private nodeEnd(slxBase: ASTBase) {
		const nextToken = this.currentToken;
		const expectedToken = LexerToken.CURLY_CLOSE;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(SyntaxIssue.CURLY_CLOSE, slxBase));
		} else {
			this.moveToNextToken;
		}

		return this.endStatment();
	}

	private isNodeEnd() {
		return (
			validToken(this.currentToken, LexerToken.CURLY_CLOSE) ||
			validToken(this.currentToken, LexerToken.SEMICOLON)
		);
	}

	private endStatment() {
		const currentToken = this.currentToken;
		if (!validToken(currentToken, LexerToken.SEMICOLON)) {
			const node = new ASTBase();
			node.tokenIndexes = { start: this.prevToken, end: this.prevToken };
			this.issues.push(this.genIssue(SyntaxIssue.END_STATMENT, node));
			return this.prevToken;
		}

		this.moveToNextToken;

		this.reportExtraEndStaments();

		return currentToken;
	}

	private reportExtraEndStaments() {
		while (validToken(this.currentToken, LexerToken.SEMICOLON)) {
			const token = this.moveToNextToken;
			const node = new ASTBase();
			node.tokenIndexes = { start: token, end: token };
			this.issues.push(this.genIssue(SyntaxIssue.NO_STAMENTE, node));
		}
	}

	private processNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		if (this.done) return false;

		let found = false;
		let child = false;
		do {
			child =
				this.isProperty(parent) ||
				this.isDeleteNode(parent, allow) ||
				this.isDeleteProperty(parent) ||
				this.isChildNode(parent, allow);

			if (!child && !this.isNodeEnd() && !this.done) {
				const node = new ASTBase();
				const token = this.moveToNextToken;
				node.tokenIndexes = { start: token, end: token };
				this.issues.push(this.genIssue(SyntaxIssue.UNKNOWN, node));
				this.reportExtraEndStaments();
			} else {
				if (this.done) {
					break;
				}
			}
			found = found || child;
		} while (!this.isNodeEnd());
		return found;
	}

	private processOptionalLablelAssign(acceptLabelName = false): LabelAssign[] {
		const labels: LabelAssign[] = [];

		// Find all labels before node/property/value.....
		let token = this.currentToken;
		while (
			validToken(token, LexerToken.LABEL_ASSIGN) ||
			(acceptLabelName &&
				validToken(token, LexerToken.LABEL_NAME) &&
				token?.pos.line === this.prevToken.pos.line)
		) {
			if (token?.value) {
				const node = new LabelAssign(token.value);
				node.tokenIndexes = { start: token, end: token };
				labels.push(node);

				if (validToken(token, LexerToken.LABEL_NAME)) {
					this.issues.push(this.genIssue(SyntaxIssue.LABEL_ASSIGN_MISSING_COLON, node));
				}
			}
			this.moveToNextToken;
			token = this.currentToken;
		}

		return labels;
	}

	private processNodeName(slxBase: ASTBase): NodeName | undefined {
		const token = this.currentToken;
		if (!validToken(token, LexerToken.NODE_NAME)) {
			return;
		} else {
			this.moveToNextToken;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		const hasAddress = token.value.includes('@');
		const tmp = token.value.split('@');
		const name = tmp[0];
		const address = hasAddress ? Number.parseInt(tmp[1], 16) : undefined;

		const node = new NodeName(name, address);
		node.tokenIndexes = { start: token, end: token };

		// <nodeName>@
		if (hasAddress && Number.isNaN(address)) {
			this.issues.push(this.genIssue(SyntaxIssue.NODE_ADDRESS, slxBase));
		}

		return node;
	}

	private isChildNode(parentNode: DtcBaseNode, allow: AllowNodeRef): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let name: NodeName | undefined;

		const child = allow === 'Ref' ? new DtcRefNode(labels) : new DtcChildNode(labels);

		const ref = this.isLabelRef();
		if (ref && allow === 'Name') {
			this.issues.push(this.genIssue([SyntaxIssue.NODE_NAME], ref));
		}

		if (!ref) {
			name = this.processNodeName(child);

			if (!name) {
				if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
					// must be property then ....
					this.popStack();
					return false;
				}

				this.issues.push(
					this.genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], child)
				);
			} else if (allow === 'Ref') {
				this.issues.push(this.genIssue([SyntaxIssue.NODE_REF], name));
			}
		}

		let expectedNode = false;
		if (ref && child instanceof DtcRefNode) {
			child.labelReferance = ref;
			expectedNode = true;
		} else if (name && child instanceof DtcChildNode) {
			expectedNode = name.address !== undefined;
			child.name = name;
		}

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				this.issues.push(this.genIssue(SyntaxIssue.CURLY_OPEN, child));
			} else {
				// this could be a property
				this.popStack();
				return false;
			}
		}

		// syntax must be a node ....

		parentNode.addNodeChild(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		const lastToken = this.nodeEnd(child);

		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? (ref ?? name)?.tokenIndexes?.start,
			end: lastToken ?? this.prevToken ?? (ref ?? name)?.tokenIndexes?.end,
		};

		this.mergeStack();
		return true;
	}

	private isProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let name: string | null;
		const token = this.moveToNextToken;

		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			if (
				labels.length &&
				!validToken(token, LexerToken.NODE_NAME) &&
				!validToken(token, LexerToken.AMPERSAND) // node label ref start
			) {
				// we have seme lables so we are expecing a property or a node then
				this.issues.push(
					this.genIssue(
						[SyntaxIssue.PROPERTY_DEFINITION, SyntaxIssue.NODE_DEFINITION],
						parent
					)
				);
				name = null;
				this.mergeStack();
				return false;
			} else {
				this.popStack();
				return false;
			}
		}

		if (
			validToken(this.currentToken, LexerToken.CURLY_OPEN) &&
			validToken(this.prevToken, LexerToken.NODE_NAME)
		) {
			// this is a node not a property
			this.popStack();
			return false;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		name = token.value;

		const propertyName = new PropertyName(name);
		const child = new DtcProperty(propertyName, labels);

		let result: PropertyValues | undefined;
		if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
			this.moveToNextToken;
			result = this.processValue(child);

			if (!result.values.filter((v) => !!v).length) {
				this.issues.push(this.genIssue(SyntaxIssue.VALUE, child));
			}
		}

		child.values = result ?? null;

		const lastToken = this.endStatment();

		propertyName.tokenIndexes = { start: token, end: token };

		// create property object

		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? token,
			end: lastToken ?? this.prevToken,
		};

		parent.addNodeChild(child);

		this.mergeStack();
		return true;
	}

	private isDtsDocumentVersion(): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		const keyword = new Keyword();

		const close = () => {
			keyword.tokenIndexes = { start: firstToken, end: token };
			const node = new DeleteNode(keyword);
			node.tokenIndexes = { start: firstToken, end: token };
			this.mergeStack();
			return true;
		};

		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		if (
			this.currentToken?.pos.line !== firstToken?.pos.line ||
			this.currentToken?.value !== 'dts-v1'
		) {
			this.popStack();
			return false;
		} else {
			this.moveToNextToken;
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}
		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DtsDocumentVersion(keyword);
		const lastToken = this.endStatment();
		node.tokenIndexes = { start: firstToken, end: lastToken };
		this.others.push(node);
		this.mergeStack();
		return true;
	}

	private isDeleteNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		const keyword = new Keyword();

		const close = () => {
			keyword.tokenIndexes = { start: firstToken, end: token };
			const node = new DeleteNode(keyword);
			node.tokenIndexes = { start: firstToken, end: token };
			parent.addNodeChild(node);
			this.mergeStack();
			return true;
		};

		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		if (
			!this.currentToken?.value &&
			!validToken(this.currentToken, LexerToken.CURLY_OPEN)
		) {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		if (
			this.currentToken?.pos.line === firstToken?.pos.line &&
			this.currentToken?.value &&
			!'delete-node'.startsWith(this.currentToken.value)
		) {
			this.popStack();
			return false;
		}

		if (this.currentToken?.value !== 'delete-node') {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}
		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteNode(keyword);

		if (this.currentToken?.pos.line === firstToken?.pos.line) {
			const labelRef = this.isLabelRef();
			if (labelRef && allow === 'Name') {
				this.issues.push(this.genIssue(SyntaxIssue.NODE_NAME, labelRef));
			}
			const nodeName = labelRef ? undefined : this.processNodeName(node);
			if (nodeName && allow === 'Ref') {
				this.issues.push(this.genIssue(SyntaxIssue.NODE_REF, nodeName));
			}

			if (!nodeName && !labelRef) {
				this.issues.push(
					this.genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], node)
				);
			}

			node.nodeNameOrRef = labelRef ?? nodeName ?? null;
		} else {
			if (allow === 'Name') {
				this.issues.push(this.genIssue(SyntaxIssue.NODE_NAME, keyword));
			} else if (allow === 'Ref') {
				this.issues.push(this.genIssue(SyntaxIssue.NODE_REF, keyword));
			}
		}
		const lastToken = this.endStatment();

		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.addNodeChild(node);
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;

		const keyword = new Keyword();
		const close = () => {
			keyword.tokenIndexes = { start: firstToken, end: token };
			const node = new DeleteProperty(keyword);
			parent.addNodeChild(node);
			node.tokenIndexes = { start: firstToken, end: token };
			this.mergeStack();
			return true;
		};

		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		if (
			!this.currentToken?.value &&
			!validToken(this.currentToken, LexerToken.CURLY_OPEN)
		) {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		if (
			this.currentToken?.pos.line === firstToken?.pos.line &&
			this.currentToken?.value &&
			!'delete-property'.startsWith(this.currentToken.value)
		) {
			this.popStack();
			return false;
		}

		if (this.currentToken?.value !== 'delete-property') {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}

		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteProperty(keyword);

		if (this.currentToken?.pos.line === firstToken?.pos.line) {
			if (!validToken(this.currentToken, LexerToken.PROPERTY_NAME)) {
				this.issues.push(this.genIssue(SyntaxIssue.PROPERTY_NAME, node));
			} else {
				token = this.moveToNextToken;

				if (!token?.value) {
					throw new Error('Token must have value');
				}
			}

			const propertyName = token?.value ? new PropertyName(token.value) : null;
			if (propertyName) {
				propertyName.tokenIndexes = { start: token, end: token };
			}

			node.propertyName = propertyName;
		} else {
			this.issues.push(this.genIssue(SyntaxIssue.PROPERTY_NAME, keyword));
		}

		const lastToken = this.endStatment();
		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.addNodeChild(node);

		this.mergeStack();
		return true;
	}

	private processValue(dtcProperty: DtcProperty): PropertyValues {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(true);

		const getValues = (): (PropertyValue | null)[] => {
			const getValue = () => {
				return (
					(this.processStringValue() ||
						this.isLabelRefValue(dtcProperty) ||
						this.__ArrayValues(dtcProperty) ||
						this.processByteStringValue(dtcProperty)) ??
					null
				);
			};
			const value = [getValue()];

			if (!value) {
				this.issues.push(this.genIssue(SyntaxIssue.VALUE, dtcProperty));
			}

			while (validToken(this.currentToken, LexerToken.COMMA)) {
				const start = this.prevToken;
				const end = this.currentToken;
				this.moveToNextToken;
				const next = getValue();
				if (next === null) {
					const node = new ASTBase();
					node.tokenIndexes = { start, end };
					this.issues.push(this.genIssue(SyntaxIssue.VALUE, node));
				}
				value.push(next);
			}

			return value;
		};

		const values = getValues();

		this.mergeStack();
		const node = new PropertyValues(values, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? values.at(0)?.tokenIndexes?.start,
			end: this.prevToken,
		};
		return node;
	}

	private processStringValue(): PropertyValue | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.STRING)) {
			this.popStack();
			return;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		const propValue = new StringValue(token.value);

		if (!token.value.match(/["']$/)) {
			this.issues.push(
				this.genIssue(
					token.value.startsWith('"') ? SyntaxIssue.DUOUBE_QUOTE : SyntaxIssue.SINGLE_QUOTE,
					propValue
				)
			);
		}

		propValue.tokenIndexes = { start: token, end: token };

		const endLabels = this.processOptionalLablelAssign(true) ?? [];

		const node = new PropertyValue(propValue, endLabels);
		node.tokenIndexes = { start: token, end: token };
		this.mergeStack();
		return node;
	}

	private __ArrayValues(dtcProperty: DtcProperty): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		}

		const value = this.processArrayValues(dtcProperty) ?? null;

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this.issues.push(this.genIssue(SyntaxIssue.GT_SYM, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		const endLabels2 = this.processOptionalLablelAssign(true) ?? [];

		this.mergeStack();
		const node = new PropertyValue(value, [...endLabels1, ...endLabels2]);
		node.tokenIndexes = {
			start: firstToken,
			end: endLabels2.at(-1)?.tokenIndexes?.end ?? this.prevToken,
		};
		return node;
	}

	private processByteStringValue(dtcProperty: DtcProperty): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		const token = firstToken;
		if (!validToken(token, LexerToken.SQUARE_OPEN)) {
			this.popStack();
			return;
		}

		const numberValues = this.processLabledValue(() => this.processHexString());

		if (!numberValues?.length) {
			this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING, dtcProperty));
		}

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this.issues.push(this.genIssue(SyntaxIssue.SQUARE_CLOSE, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		numberValues.forEach((value) => {
			if ((value.value?.tokenIndexes?.start?.pos.len ?? 0) % 2 !== 0) {
				this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING_EVEN, value));
			}

			if (value.tokenIndexes?.start?.tokens.some((tok) => tok === LexerToken.HEX)) {
				this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING_HEX, value));
			}
		});

		const endLabels2 = this.processOptionalLablelAssign(true) ?? [];

		this.mergeStack();
		const byteString = new ByteStringValue(numberValues ?? []);
		byteString.tokenIndexes = {
			start: numberValues.at(0)?.tokenIndexes?.start,
			end: endLabels2.at(-1)?.tokenIndexes?.end ?? numberValues.at(-1)?.tokenIndexes?.end,
		};

		const node = new PropertyValue(byteString, [...endLabels1, ...endLabels2]);
		node.tokenIndexes = { start: firstToken, end: this.prevToken };
		return node;
	}

	private processLabledValue<T extends ASTBase>(
		processValue: () => LabledValue<T> | undefined
	): LabledValue<T>[] {
		this.enqueToStack();

		let value = processValue();
		let result: LabledValue<T>[] = [];

		if (!value) {
			this.popStack();
			return [];
		}

		while (value) {
			result = [...result, value];
			value = processValue();
		}

		if (result) {
			const nextValue = processValue();
			if (nextValue) {
				result = [...result, nextValue];
			}
		}

		this.mergeStack();
		return result;
	}

	private processArrayValues(dtcProperty: DtcProperty): ArrayValues | undefined {
		this.enqueToStack();

		const result = this.processLabledValue(
			(): LabledValue<NumberValue | LabelRef | NodePathRef | Expression> | undefined =>
				this.processRefValue(false, dtcProperty) ||
				this.processLabledHex(false) ||
				this.processLabledExpression(true, false) ||
				this.processLabledDec(true)
		);

		const node = new ArrayValues(result);
		node.tokenIndexes = {
			start: result.at(0)?.tokenIndexes?.start,
			end: result.at(-1)?.tokenIndexes?.end,
		};
		this.mergeStack();
		return node;
	}

	private processLabledHex(acceptLabelName: boolean): LabledValue<NumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(acceptLabelName);
		const numbeValue = this.processHex();
		if (!numbeValue) {
			this.popStack();
			return;
		}

		const node = new LabledValue(numbeValue, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? numbeValue.tokenIndexes?.start,
			end: numbeValue.tokenIndexes?.end,
		};
		this.mergeStack();
		return node;
	}

	private processHex(): NumberValue | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.HEX)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		const numbeValue = new NumberValue(Number.parseInt(token.value, 16));
		numbeValue.tokenIndexes = { start: token, end: token };
		this.mergeStack();
		return numbeValue;
	}

	private processHexString(): LabledValue<NumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(false);
		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.HEX_STRING)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		const numbeValue = new NumberValue(Number.parseInt(token.value, 16));
		numbeValue.tokenIndexes = { start: token, end: token };
		const node = new LabledValue(numbeValue, labels);
		node.tokenIndexes = { start: labels.at(0)?.tokenIndexes?.end ?? token, end: token };
		return node;
	}

	private processLabledDec(acceptLabelName: boolean): LabledValue<NumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(acceptLabelName);

		const numbeValue = this.processDec();
		if (!numbeValue) {
			this.popStack();
			return;
		}
		const node = new LabledValue(numbeValue, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? numbeValue.tokenIndexes?.start,
			end: numbeValue.tokenIndexes?.end,
		};
		this.mergeStack();
		return node;
	}

	private processDec(): NumberValue | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.DIGITS)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		const numbeValue = new NumberValue(Number.parseInt(token.value, 10));
		numbeValue.tokenIndexes = { start: token, end: token };
		return numbeValue;
	}

	private processCIdentifier(): CIdentifier | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.C_IDENTIFIER)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		const idnetifier = new CIdentifier(token.value);
		idnetifier.tokenIndexes = { start: token, end: token };
		return idnetifier;
	}

	private processLabledExpression(
		checkForLables = true,
		acceptLabelName = checkForLables
	): LabledValue<Expression> | undefined {
		this.enqueToStack();

		let labels: LabelAssign[] = [];
		if (checkForLables) {
			labels = this.processOptionalLablelAssign(acceptLabelName);
		}

		const expression = this.processExpression();

		if (!expression && checkForLables) {
			this.popStack();
			return this.processLabledExpression(false);
		} else if (!expression) {
			this.popStack();
			return;
		}

		const node = new LabledValue(expression, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? expression.tokenIndexes?.end,
			end: expression.tokenIndexes?.end,
		};
		this.mergeStack();
		return node;
	}

	private isOperator(): Operator | undefined {
		this.enqueToStack();
		const start = this.moveToNextToken;
		let end = start;

		let operator: OperatorType | undefined;
		if (validToken(start, LexerToken.AMPERSAND)) {
			operator = OperatorType.BIT_AND;
			if (validToken(this.currentToken, LexerToken.AMPERSAND)) {
				operator = OperatorType.BOOLEAN_AND;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_NOT)) {
			operator = OperatorType.BIT_NOT;
			if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_NOT_EQ;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_OR)) {
			operator = OperatorType.BIT_OR;
			if (validToken(this.currentToken, LexerToken.BIT_OR)) {
				operator = OperatorType.BOOLEAN_OR;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_XOR)) {
			operator = OperatorType.BIT_XOR;
		} else if (validToken(start, LexerToken.GT_SYM)) {
			operator = OperatorType.BOOLEAN_GT;
			if (validToken(this.currentToken, LexerToken.GT_SYM)) {
				operator = OperatorType.BIT_RIGHT_SHIFT;
				end = this.moveToNextToken;
			} else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_GT_EQUAL;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.LT_SYM)) {
			operator = OperatorType.BOOLEAN_GT;
			if (validToken(this.currentToken, LexerToken.LT_SYM)) {
				operator = OperatorType.BIT_LEFT_SHIFT;
				end = this.moveToNextToken;
			} else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_LT_EQUAL;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.ADD_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_ADD;
		} else if (validToken(start, LexerToken.NEG_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_SUBTRACT;
		} else if (validToken(start, LexerToken.MULTI_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_MULTIPLE;
		} else if (validToken(start, LexerToken.FORWARD_SLASH)) {
			operator = OperatorType.ARITHMETIC_DIVIDE;
		} else if (validToken(start, LexerToken.MODULUS_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_MODULES;
		}

		if (operator) {
			const node = new Operator(operator);
			node.tokenIndexes = { start, end };
			this.mergeStack();
			return node;
		}
		this.popStack();
		return;
	}

	private isFuntion(): FunctionCall | undefined {
		this.enqueToStack();
		const identifier = this.processCIdentifier();
		if (!identifier) {
			this.popStack();
			return;
		}

		let token = this.moveToNextToken;
		if (!validToken(token, LexerToken.ROUND_OPEN)) {
			this.popStack();
			return;
		}

		const params: Expression[] = [];
		let exp = this.processExpression();
		while (exp) {
			params.push(exp);
			exp = this.processExpression();
		}

		if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
			this.issues.push(
				this.genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? identifier)
			);
		} else {
			token = this.moveToNextToken;
		}

		const node = new FunctionCall(identifier, params);
		node.tokenIndexes = {
			start: identifier.tokenIndexes?.start,
			end: token ?? params.at(-1)?.tokenIndexes?.end,
		};

		this.mergeStack();
		return node;
	}

	private isInclude(): boolean {
		this.enqueToStack();

		const start = this.moveToNextToken;
		const line = start?.pos.line;

		let token = start;
		if (!validToken(token, LexerToken.C_INCLUDE)) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword();
		keyword.tokenIndexes = { start, end: start };

		const moveEndOfLine = () => {
			if (this.currentToken?.pos.line !== line) {
				return;
			}

			const begin = this.currentToken;
			while (this.currentToken?.pos.line === line) {
				token = this.moveToNextToken;
			}
			const node = new ASTBase();
			node.tokenIndexes = { start: begin, end: token };
			this.issues.push(this.genIssue(SyntaxIssue.INVALID_INCLUDE_SYNTAX, node));
		};

		token = this.moveToNextToken;
		const pathStart = token;
		const relative = !!validToken(token, LexerToken.STRING);
		if (!relative && !validToken(token, LexerToken.LT_SYM)) {
			moveEndOfLine();
			this.mergeStack();
			return true;
		}

		let path = '';

		if (relative) {
			path = token?.value ?? '';
		} else {
			while (token?.pos.line === line && !validToken(token, LexerToken.GT_SYM)) {
				if (validToken(token, LexerToken.FORWARD_SLASH)) {
					path += '/';
				} else {
					path += token?.value ?? '';
				}
				token = this.moveToNextToken;
			}
		}

		const incudePath = new IncludePath(path, relative);
		const node = new Include(keyword, incudePath);
		this.includes.push(node);

		if (!relative && (token?.pos.line !== line || !validToken(token, LexerToken.GT_SYM))) {
			this.issues.push(this.genIssue(SyntaxIssue.INCLUDE_CLOSE_PATH, node));
		}

		incudePath.tokenIndexes = { start: pathStart, end: token };
		node.tokenIndexes = { start, end: token };

		moveEndOfLine();

		this.mergeStack();
		return true;
	}

	private processExpression(): Expression | undefined {
		this.enqueToStack();

		let complexExpression = false;

		let start: Token | undefined;
		let token: Token | undefined;
		if (validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
			complexExpression = true;
			start = this.moveToNextToken;
			token = start;
		}

		let expression: Expression | undefined =
			this.isFuntion() ||
			this.processCIdentifier() ||
			this.processDec() ||
			this.processHex();

		if (!expression) {
			this.popStack();
			return;
		}

		if (complexExpression) {
			const operator = this.isOperator();

			if (operator) {
				// complex
				const nextExpression = this.processExpression();

				if (!nextExpression) {
					this.issues.push(this.genIssue(SyntaxIssue.EXPECTED_EXPRESSION, operator));
				} else {
					expression = new ComplexExpression(expression, {
						operator,
						expression: nextExpression,
					});
				}

				expression.tokenIndexes = {
					start: start,
					end: nextExpression?.tokenIndexes?.end ?? operator.tokenIndexes?.end,
				};
			}

			if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				this.issues.push(
					this.genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, operator ?? expression)
				);
			} else {
				token = this.moveToNextToken;
			}
		}

		this.mergeStack();
		return expression;
	}

	private isLabelRef(slxBase?: ASTBase): LabelRef | undefined {
		this.enqueToStack();
		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		if (!validToken(this.currentToken, LexerToken.LABEL_NAME)) {
			const node = new LabelRef(null);
			this.issues.push(this.genIssue(SyntaxIssue.LABEL_NAME, slxBase ?? node));
			node.tokenIndexes = { start: firstToken, end: firstToken };

			this.mergeStack();
			return node;
		}

		const token = this.moveToNextToken;

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		const labelName = new Label(token.value);
		labelName.tokenIndexes = { start: token, end: token };
		const node = new LabelRef(labelName);
		node.tokenIndexes = { start: firstToken, end: token };
		this.mergeStack();
		return node;
	}

	private isLabelRefValue(dtcProperty: DtcProperty): PropertyValue | undefined {
		this.enqueToStack();

		const labelRef = this.isLabelRef(dtcProperty);

		if (!labelRef) {
			this.popStack();
			return;
		}

		const endLabels = this.processOptionalLablelAssign(true);

		const node = new PropertyValue(labelRef, endLabels);
		node.tokenIndexes = {
			start: labelRef.tokenIndexes?.start,
			end: endLabels.at(-1)?.tokenIndexes?.end ?? labelRef.tokenIndexes?.end,
		};

		this.mergeStack();
		return node;
	}

	private processRefValue(
		acceptLabelName: boolean,
		dtcProperty: DtcProperty
	): LabledValue<LabelRef | NodePathRef> | undefined {
		const labels = this.processOptionalLablelAssign(acceptLabelName);
		const firstToken = this.currentToken;
		if (!validToken(this.currentToken, LexerToken.AMPERSAND)) {
			return;
		}

		const nodePath = this.processNodePathRef();

		if (nodePath !== undefined) {
			const node = new LabledValue(nodePath, labels);
			node.tokenIndexes = {
				start: labels.at(0)?.tokenIndexes?.start ?? nodePath.tokenIndexes?.start,
				end: nodePath.tokenIndexes?.end,
			};
			return node;
		}

		const labelRef = this.isLabelRef(dtcProperty);
		if (labelRef === undefined) {
			this.issues.push(
				this.genIssue([SyntaxIssue.LABEL_NAME, SyntaxIssue.NODE_PATH], dtcProperty)
			);

			const node = new LabledValue<LabelRef>(null, labels);
			node.tokenIndexes = {
				start: labels.at(0)?.tokenIndexes?.end ?? firstToken,
				end: firstToken,
			};
			return node;
		}

		const node = new LabledValue(labelRef, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? firstToken,
			end: labelRef.tokenIndexes?.end,
		};
		return node;
	}

	private processNodePath(first = true, nodePath = new NodePath()): NodePath | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;

		if (!validToken(firstToken, LexerToken.FORWARD_SLASH)) {
			if (!first) {
				this.popStack();
				return;
			}
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_START_PATH, nodePath));
		}

		const nodeName = this.processNodeName(nodePath);
		if (!nodeName) {
			this.issues.push(this.genIssue(SyntaxIssue.NODE_NAME, nodePath));
		}

		nodePath.tokenIndexes ??= {
			start: firstToken,
			end: nodeName?.tokenIndexes?.end ?? firstToken,
		};

		nodePath.addPath(nodeName ?? null);
		nodePath.tokenIndexes.end = nodeName?.tokenIndexes?.end ?? firstToken;

		this.processNodePath(false, nodePath);

		this.mergeStack();
		return nodePath;
	}

	private processNodePathRef(): NodePathRef | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		const beforPath = this.moveToNextToken;
		token = beforPath;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			// migh be a node ref such as &nodeLabel
			this.popStack();
			return;
		}

		// now we must have a valid path
		// /soc/node/node2@223/....
		const nodePath = this.processNodePath();

		const node = new NodePathRef(nodePath ?? null);

		const lastToken = this.currentToken;
		const afterPath = lastToken;
		if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
			this.issues.push(this.genIssue(SyntaxIssue.CURLY_CLOSE, node));
		} else {
			this.moveToNextToken;
		}

		node.tokenIndexes = {
			start: firstToken,
			end: lastToken ?? nodePath?.tokenIndexes?.end ?? this.prevToken,
		};

		const nodePathRange = nodePath ? toRange(nodePath) : undefined;
		if (
			nodePathRange &&
			beforPath &&
			afterPath &&
			(beforPath.pos.col !== nodePathRange?.start.character - 1 ||
				afterPath.pos.col !== nodePathRange?.end.character)
		) {
			this.issues.push(this.genIssue(SyntaxIssue.NODE_PATH_WHITE_SPACE_NOT_ALLOWED, node));
		}

		this.mergeStack();
		return node;
	}

	private get moveToNextToken() {
		const token = this.currentToken;
		this.moveStackIndex();
		return token;
	}

	private enqueToStack() {
		this.positionStack.push(this.peekIndex());
	}

	private popStack() {
		this.positionStack.pop();
	}

	private mergeStack() {
		const value = this.positionStack.pop();

		if (!value) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1] = value;
	}

	private peekIndex(depth = 1) {
		const peek = this.positionStack.at(-1 * depth);
		if (peek === undefined) {
			throw new Error('Index out of bounds');
		}

		return peek;
	}

	get currentToken() {
		return this.tokens.at(this.peekIndex());
	}

	get prevToken() {
		return this.tokens[this.peekIndex() - 1];
	}

	private moveStackIndex() {
		if (this.positionStack[this.positionStack.length - 1] === undefined) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1]++;
	}

	private genIssue = (
		issue: SyntaxIssue | SyntaxIssue[],
		astBase: ASTBase
	): Issue<SyntaxIssue> => ({
		issues: Array.isArray(issue) ? issue : [issue],
		astElement: astBase,
		severity: DiagnosticSeverity.Error,
		linkedTo: [],
		templateStrings: [],
	});

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...this.includes.flatMap((o) => o.getDocumentSymbols()),
			...this.rootDocument.getDocumentSymbols(),
			...this.others.flatMap((o) => o.getDocumentSymbols()),
		];
	}

	buildSemanticTokens(tokensBuilder: SemanticTokensBuilder) {
		const result: {
			line: number;
			char: number;
			length: number;
			tokenType: number;
			tokenModifiers: number;
		}[] = [];
		const push = (
			tokenType: number,
			tokenModifiers: number,
			tokenIndexes?: TokenIndexes
		) => {
			if (!tokenIndexes?.start || !tokenIndexes?.end) return;

			const lengthEnd =
				tokenIndexes.end.pos.col - tokenIndexes.start.pos.col + tokenIndexes.end.pos.len;
			result.push({
				line: tokenIndexes.start.pos.line,
				char: tokenIndexes.start.pos.col,
				length:
					tokenIndexes.end === tokenIndexes.start ? tokenIndexes.end.pos.len : lengthEnd,
				tokenType,
				tokenModifiers,
			});
		};

		this.rootDocument.buildSemanticTokens(push);
		this.others.forEach((a) => a.buildSemanticTokens(push));
		this.includes.forEach((a) => a.buildSemanticTokens(push));

		this.tokens
			.filter(
				(token) =>
					validToken(token, LexerToken.CURLY_OPEN) ||
					validToken(token, LexerToken.CURLY_CLOSE)
			)
			.forEach((token) => {
				result.push({
					line: token.pos.len,
					char: token.pos.col,
					length: 1,
					tokenType: getTokenTypes('struct'),
					tokenModifiers: getTokenModifiers('declaration'),
				});
			});
		result
			.sort((a, b) => (a.line === b.line ? a.char - b.char : a.line - b.line))
			.forEach((r) =>
				tokensBuilder.push(r.line, r.char, r.length, r.tokenType, r.tokenModifiers)
			);
	}
}

const validToken = (token: Token | undefined, expected: LexerToken) =>
	token?.tokens.some((t) => t === expected);
