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
import { NodePath, NodePathRef, NodePathValue } from './ast/dtc/values/nodePath';
import { LabelRefValue } from './ast/dtc/values/labelRef';
import { NumberValue, NumberValues, NumberWithLabelValue } from './ast/dtc/values/number';
import { ByteStringValue } from './ast/dtc/values/byteString';
import { PropertyValues } from './ast/dtc/values/values';

type AllowNodeRef = 'Ref' | 'Name';

export class Parser {
	rootDocument = new DtcBaseNode(null);
	positionStack: number[] = [];
	issues: Issue<SyntaxIssue>[] = [];
	unhandledStaments = new DtcRootNode(null);

	constructor(private tokens: Token[]) {
		this.parse();
	}

	get done() {
		return this.peekIndex() >= this.tokens.length;
	}

	private parse() {
		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		const process = () => {
			if (
				!(
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
		const rootNode = new DtcRootNode(null);
		parent.addChild(rootNode);
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

		return this.endStatment(slxBase);
	}

	private isNodeEnd() {
		return (
			validToken(this.currentToken, LexerToken.CURLY_CLOSE) ||
			validToken(this.currentToken, LexerToken.SEMICOLON)
		);
	}

	// TODO
	// no ref
	// c presosessor
	// terninary

	private endStatment(slxBase: ASTBase) {
		const currentToken = this.currentToken;
		if (!validToken(currentToken, LexerToken.SEMICOLON)) {
			this.issues.push(this.genIssue(SyntaxIssue.END_STATMENT, slxBase));
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
		const address = hasAddress ? Number.parseInt(tmp[1]) : undefined;

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

		const child =
			allow === 'Ref'
				? new DtcRefNode(parentNode, labels)
				: new DtcChildNode(parentNode, labels);

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
		} else if (name && child instanceof DtcChildNode) {
			expectedNode = !!name.address;
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

		parentNode.addChild(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		const lastToken = this.nodeEnd(child);

		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? (ref ?? name)?.tokenIndexes?.start,
			end: lastToken ?? this.prevToken,
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
			if (labels.length && !validToken(token, LexerToken.NODE_NAME)) {
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

		const lastToken = this.endStatment(child);

		propertyName.tokenIndexes = { start: token, end: token };

		// create property object

		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? token,
			end: lastToken ?? this.prevToken,
		};

		parent.addChild(child);

		this.mergeStack();
		return true;
	}

	private isDeleteNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		token = this.moveToNextToken;
		if (token?.value && !'delete-node'.startsWith(token.value)) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword();

		if (token?.value !== 'delete-node') {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
		} else {
			token = this.moveToNextToken;
		}
		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteNode(keyword);

		const labelRef = this.isLabelRef();
		if (labelRef && allow === 'Name') {
			this.issues.push(this.genIssue(SyntaxIssue.NODE_NAME, labelRef));
		}
		const nodeName = labelRef ? undefined : this.processNodeName(node);
		if (nodeName && allow === 'Ref') {
			this.issues.push(this.genIssue(SyntaxIssue.NODE_REF, nodeName));
		}

		if (!nodeName && !labelRef) {
			this.issues.push(this.genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], node));
		}

		node.nodeNameOrRef = labelRef ?? nodeName ?? null;

		const lastToken = this.endStatment(node);
		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.addChild(node);
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		token = this.moveToNextToken;
		if (token?.value && !'delete-property'.startsWith(token.value)) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword();

		if (token?.value !== 'delete-property') {
			this.issues.push(this.genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
		} else {
			token = this.moveToNextToken;
		}

		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteProperty(keyword);

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

		const lastToken = this.endStatment(node);
		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.addChild(node);

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
						this.processNumericNodePathOrRefValue(dtcProperty) ||
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

	private processNumericNodePathOrRefValue(
		dtcProperty: DtcProperty
	): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		}

		const value =
			(this.processNumericValues() || this.processNodePathOrLabelRefValue(dtcProperty)) ??
			null;
		if (!value) {
			this.issues.push(
				this.genIssue(
					[SyntaxIssue.NUMERIC_VALUE, SyntaxIssue.NODE_REF, SyntaxIssue.NODE_PATH],
					dtcProperty
				)
			);
		}

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

		const numberValues = this.processNumericValues();

		if (!numberValues?.values.length) {
			this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING, dtcProperty));
		}

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this.issues.push(this.genIssue(SyntaxIssue.SQUARE_CLOSE, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		numberValues?.values.forEach((value) => {
			if ((value.tokenIndexes?.start?.pos.len ?? 0) % 2 !== 0) {
				this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING_EVEN, value));
			}

			if (value.tokenIndexes?.start?.tokens.some((tok) => tok === LexerToken.HEX)) {
				this.issues.push(this.genIssue(SyntaxIssue.BYTESTRING_HEX, value));
			}
		});

		const endLabels2 = this.processOptionalLablelAssign(true) ?? [];

		this.mergeStack();
		const byteString = new ByteStringValue(numberValues?.values ?? []);
		byteString.tokenIndexes = {
			start: numberValues?.tokenIndexes?.start,
			end: endLabels2.at(-1)?.tokenIndexes?.end ?? numberValues?.tokenIndexes?.end,
		};

		const node = new PropertyValue(byteString, [...endLabels1, ...endLabels2]);
		node.tokenIndexes = { start: firstToken, end: this.prevToken };
		return node;
	}

	private processNumericValues(): NumberValues | undefined {
		this.enqueToStack();

		let value = this.processHex(false) || this.processDec(true);
		let result: NumberWithLabelValue[] = [];

		if (!value) {
			this.popStack();
			return;
		}

		while (value) {
			result = [...result, value];

			value = this.processHex(false) || this.processDec(true);
		}

		if (result) {
			const nextValue = this.processHex(false) || this.processDec(true);
			if (nextValue) {
				result = [...result, nextValue];
			}
		}

		this.mergeStack();
		const node = new NumberValues(result);
		node.tokenIndexes = {
			start: result.at(0)?.tokenIndexes?.start,
			end: result.at(-1)?.tokenIndexes?.end,
		};
		return node;
	}

	private processHex(acceptLabelName: boolean): NumberWithLabelValue | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(acceptLabelName);
		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.HEX)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		const numbeValue = new NumberValue(Number.parseInt(token.value, 16));
		numbeValue.tokenIndexes = { start: token, end: token };
		const node = new NumberWithLabelValue(numbeValue, labels);
		node.tokenIndexes = { start: labels.at(0)?.tokenIndexes?.end ?? token, end: token };
		return node;
	}

	private processDec(acceptLabelName: boolean): NumberWithLabelValue | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(acceptLabelName);
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
		const node = new NumberWithLabelValue(numbeValue, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? token,
			end: token,
		};
		return node;
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

	private processNodePathOrLabelRefValue(
		dtcProperty: DtcProperty
	): LabelRefValue | NodePathValue | undefined {
		const labels = this.processOptionalLablelAssign(true);
		const firstToken = this.currentToken;
		if (!validToken(this.currentToken, LexerToken.AMPERSAND)) {
			return;
		}

		const nodePath = this.processNodePathRef();

		if (nodePath !== undefined) {
			const node = new NodePathValue(nodePath, labels);
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

			const node = new LabelRefValue(null, labels);
			node.tokenIndexes = {
				start: labels.at(0)?.tokenIndexes?.end ?? firstToken,
				end: firstToken,
			};
			return node;
		}

		const node = new LabelRefValue(labelRef.label, labels);
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

		nodePath.pathParts.push(nodeName ?? null);
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
		slxBase: ASTBase
	): Issue<SyntaxIssue> => ({
		issues: Array.isArray(issue) ? issue : [issue],
		slxElement: slxBase,
		severity: DiagnosticSeverity.Error,
	});

	getDocumentSymbols(): DocumentSymbol[] {
		return this.rootDocument.getDocumentSymbols();
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
