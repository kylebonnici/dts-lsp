import { Issue, LexerToken, SyntaxIssue, Token, TokenIndexes } from './types';
import {
	adjesentTokens,
	createTokenIndex,
	genIssue,
	sameLine,
	toRange,
	validateToken,
	validateValue,
	validToken,
} from './helpers';
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
import { ArrayValues } from './ast/dtc/values/arrayValue';
import { LabledValue } from './ast/dtc/values/labledValue';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { Operator, OperatorType } from './ast/cPreprocessors/operator';
import { ComplexExpression, Expression } from './ast/cPreprocessors/expression';
import { FunctionCall } from './ast/cPreprocessors/functionCall';
import { BaseParser } from './baseParser';
import { CPreprocessorParser } from './cPreprocessorParser';

type AllowNodeRef = 'Ref' | 'Name';

export class Parser extends BaseParser {
	public tokens: Token[] = [];
	cPreprocessorParser: CPreprocessorParser;

	others: ASTBase[] = [];
	rootDocument = new DtcBaseNode();
	issues: Issue<SyntaxIssue>[] = [];
	unhandledStaments = new DtcRootNode();

	constructor(
		public readonly uri: string,
		private incudes: string[],
		private common: string[]
	) {
		super();
		this.cPreprocessorParser = new CPreprocessorParser(this.uri, this.incudes, this.common);
		this.rootDocument.uri = uri;
	}

	protected reset() {
		super.reset();
		this.others = [];
		this.rootDocument = new DtcBaseNode();
		this.rootDocument.uri = this.uri;
		this.issues = [];
		this.unhandledStaments = new DtcRootNode();
	}

	public async reparse(): Promise<void> {
		this.reset();
		this.cPreprocessorParser.reparse();
		this.parsing = this.parse();
		return this.parsing;
	}

	async parse() {
		await this.cPreprocessorParser.stable;
		this.tokens = this.cPreprocessorParser.tokens;

		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		const process = () => {
			if (
				!(
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
				const token = this.moveToNextToken;
				if (token) {
					const node = new ASTBase(createTokenIndex(token));
					this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
					this.reportExtraEndStaments();
				}
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
		const rootNode = new DtcRootNode();
		parent.addNodeChild(rootNode);
		this.processNode(rootNode, 'Name');

		const lastToken = this.nodeEnd(rootNode) ?? nextToken;
		rootNode.fisrtToken = firstToken;
		rootNode.lastToken = lastToken;
		this.mergeStack();
		return true;
	}

	private nodeEnd(slxBase: ASTBase) {
		const nextToken = this.currentToken;
		if (!validToken(nextToken, LexerToken.CURLY_CLOSE)) {
			this.issues.push(genIssue(SyntaxIssue.CURLY_CLOSE, slxBase));
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
			const token = this.prevToken;
			if (token) {
				const node = new ASTBase(createTokenIndex(this.prevToken));
				this.issues.push(genIssue(SyntaxIssue.END_STATMENT, node));
				return token;
			}
		}

		this.moveToNextToken;

		this.reportExtraEndStaments();

		return currentToken;
	}

	private reportExtraEndStaments() {
		while (validToken(this.currentToken, LexerToken.SEMICOLON)) {
			const token = this.moveToNextToken;
			if (token) {
				const node = new ASTBase(createTokenIndex(token));
				this.issues.push(genIssue(SyntaxIssue.NO_STAMENTE, node));
			}
		}
	}

	private processNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
		if (this.done) return false;

		let found = false;
		let child = false;
		do {
			child =
				this.isProperty(parent) ||
				this.isChildNode(parent, allow) ||
				this.isDeleteNode(parent, allow) ||
				this.isDeleteProperty(parent);

			if (!child && !this.isNodeEnd() && !this.done) {
				const token = this.moveToNextToken;
				if (token) {
					const node = new ASTBase(createTokenIndex(token));
					this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
					this.reportExtraEndStaments();
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

	private processOptionalLablelAssign(acceptLabelName = false): LabelAssign[] {
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
		this.enqueToStack();

		let omitIfNoRef: Keyword | undefined;
		if (allow === 'Name') {
			omitIfNoRef = this.isOmitIfNoRefNode();
		}

		const labels = this.processOptionalLablelAssign();

		let name: NodeName | undefined;

		const child =
			allow === 'Ref' ? new DtcRefNode(labels) : new DtcChildNode(labels, omitIfNoRef);

		const ref = this.isLabelRef();
		if (ref && allow === 'Name') {
			this.issues.push(genIssue([SyntaxIssue.NODE_NAME], ref));
		}

		if (!ref) {
			name = this.isNodeName();

			if (!name) {
				if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
					// must be property then ....
					this.popStack();
					return false;
				}

				this.issues.push(genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], child));
			} else if (allow === 'Ref') {
				this.issues.push(genIssue([SyntaxIssue.NODE_REF], name));
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

		if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				this.issues.push(genIssue(SyntaxIssue.CURLY_OPEN, child));
			} else {
				// this could be a property
				this.popStack();
				return false;
			}
		} else {
			this.moveToNextToken;
		}

		// syntax must be a node ....

		parentNode.addNodeChild(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		const lastToken = this.nodeEnd(child);

		child.lastToken = lastToken;

		this.mergeStack();
		return true;
	}

	private isNodeName(): NodeName | undefined {
		this.enqueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[
				LexerToken.DIGITS,
				LexerToken.LETTERS,
				LexerToken.COMMA,
				LexerToken.PERIOD,
				LexerToken.UNDERSCOURE,
				LexerToken.ADD_OPERATOR,
				LexerToken.NEG_OPERATOR,
			].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		if (!name.match(/^[A-Za-z]/)) {
			this.popStack();
			return;
		}

		const atValid = this.checkConcurrentTokens([validateToken(LexerToken.AT)]);
		if (atValid.length) {
			const addressValid = this.consumeAnyConcurrentTokens(
				[LexerToken.DIGITS, LexerToken.HEX].map(validateToken)
			);

			const address = addressValid.length
				? Number.parseInt(addressValid.map((v) => v.value).join(''), 16)
				: NaN;
			const node = new NodeName(
				name,
				createTokenIndex(valid[0], addressValid.at(-1) ?? valid.at(-1)),
				address
			);

			if (!adjesentTokens(valid.at(-1), atValid[0])) {
				this.issues.push(genIssue(SyntaxIssue.NODE_NAME_ADDRESS_WHITE_SPACE, node));
			} else if (Number.isNaN(address)) {
				this.issues.push(genIssue(SyntaxIssue.NODE_ADDRESS, node));
			} else if (
				!Number.isNaN(address) &&
				!adjesentTokens(atValid.at(-1), addressValid[0])
			) {
				this.issues.push(genIssue(SyntaxIssue.NODE_NAME_ADDRESS_WHITE_SPACE, node));
			}

			this.mergeStack();
			return node;
		}

		const node = new NodeName(name, createTokenIndex(valid[0], valid.at(-1)));
		this.mergeStack();
		return node;
	}

	private isPropertyName(): PropertyName | undefined {
		this.enqueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[
				LexerToken.DIGITS,
				LexerToken.LETTERS,
				LexerToken.COMMA,
				LexerToken.PERIOD,
				LexerToken.UNDERSCOURE,
				LexerToken.ADD_OPERATOR,
				LexerToken.NEG_OPERATOR,
				LexerToken.QUESTION_MARK,
				LexerToken.HASH,
			].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return;
		}
		const node = new PropertyName(
			valid.map((v) => v.value).join(''),
			createTokenIndex(valid[0], valid.at(-1))
		);
		this.mergeStack();
		return node;
	}

	private isLabelName(): Label | undefined {
		this.enqueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.LETTERS, LexerToken.UNDERSCOURE].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return undefined;
		}

		const name = valid.map((v) => v.value).join('');

		if (!name.match(/^[A-Za-z]/)) {
			this.popStack();
			return;
		}

		const node = new Label(name, createTokenIndex(valid[0], valid.at(-1)));
		this.mergeStack();
		return node;
	}

	private isLabelAssign(acceptLabelName: boolean): LabelAssign | undefined {
		this.enqueToStack();
		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.LETTERS, LexerToken.UNDERSCOURE].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		if (!name.match(/^[A-Za-z]/)) {
			this.popStack();
			return;
		}

		const token = this.currentToken;
		const hasColon = token && validToken(token, LexerToken.COLON);
		const node = new LabelAssign(name, createTokenIndex(valid[0], token ?? valid.at(-1)));

		if (!hasColon) {
			if (acceptLabelName) {
				this.issues.push(genIssue(SyntaxIssue.LABEL_ASSIGN_MISSING_COLON, node));
			} else {
				this.popStack();
				return;
			}
		} else {
			this.moveToNextToken;
		}

		this.mergeStack();
		return node;
	}

	private isProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

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
			this.moveToNextToken;
			result = this.processValue(node);

			if (!result.values.filter((v) => !!v).length) {
				this.issues.push(genIssue(SyntaxIssue.VALUE, node));
			}
		}

		node.values = result ?? null;
		const lastToken = this.endStatment();

		// create property object
		node.lastToken = lastToken;

		parent.addNodeChild(node);

		this.mergeStack();
		return true;
	}

	private isDtsDocumentVersion(): boolean {
		this.enqueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('d'),
			validateValue('ts'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('v'),
			validateValue('1'),
		]);

		if (!valid.length) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;

		if (valid.length === 1 && !validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
			this.popStack();
			return false;
		}

		if (valid.length !== 6) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword();
		keyword.fisrtToken = firstToken;
		const node = new DtsDocumentVersion(keyword);
		this.others.push(node);

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, node));
			this.mergeStack();
			return true;
		} else {
			token = this.moveToNextToken;
		}

		keyword.lastToken = token;

		node.lastToken = this.endStatment();
		this.mergeStack();
		return true;
	}

	private isOmitIfNoRefNode(): Keyword | undefined {
		this.enqueToStack();

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
		this.enqueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('de'),
			validateValue('lete'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('node'),
		]);

		if (!valid.length) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];
		let token: Token | undefined = firstToken;
		const keyword = new Keyword();
		keyword.fisrtToken = firstToken;

		const close = () => {
			keyword.lastToken = valid.at(-1);
			const node = new DeleteNode(keyword);
			parent.addNodeChild(node);
			this.mergeStack();
			return true;
		};

		if (valid.length === 1 && !validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
			this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		const stringValue = valid.map((t) => t.value ?? '').join('');

		if (!'/delete-node/'.startsWith(stringValue) || stringValue.endsWith('-')) {
			this.popStack();
			return false;
		}

		if (valid.length !== 5) {
			this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}
		keyword.lastToken = token;

		const node = new DeleteNode(keyword);

		if (sameLine(keyword.tokenIndexes?.end, firstToken)) {
			const labelRef = this.isLabelRef();
			if (labelRef && allow === 'Name') {
				this.issues.push(genIssue(SyntaxIssue.NODE_NAME, labelRef));
			}
			const nodeName = labelRef ? undefined : this.isNodeName();
			if (nodeName && allow === 'Ref') {
				this.issues.push(genIssue(SyntaxIssue.NODE_REF, nodeName));
			}

			if (!nodeName && !labelRef) {
				this.issues.push(genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], node));
			}

			node.nodeNameOrRef = labelRef ?? nodeName ?? null;
		} else {
			if (allow === 'Name') {
				this.issues.push(genIssue(SyntaxIssue.NODE_NAME, keyword));
			} else if (allow === 'Ref') {
				this.issues.push(genIssue(SyntaxIssue.NODE_REF, keyword));
			}
		}
		const lastToken = this.endStatment();

		node.lastToken = lastToken;
		parent.addNodeChild(node);
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.FORWARD_SLASH),
			validateValue('de'),
			validateValue('lete'),
			validateToken(LexerToken.NEG_OPERATOR),
			validateValue('property'),
		]);

		if (!valid.length) {
			this.popStack();
			return false;
		}

		const firstToken = valid[0];

		let token: Token | undefined = firstToken;
		const keyword = new Keyword();
		keyword.fisrtToken = firstToken;

		const close = () => {
			keyword.lastToken = valid.at(-1);
			const node = new DeleteProperty(keyword);
			parent.addNodeChild(node);
			this.mergeStack();
			return true;
		};

		if (valid.length === 1 && !validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
			this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		const stringValue = valid.map((t) => t.value ?? '').join('');

		if (!'/delete-property/'.startsWith(stringValue) || stringValue.endsWith('-')) {
			this.popStack();
			return false;
		}

		if (valid.length !== 5) {
			this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
			return close();
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(genIssue(SyntaxIssue.FORWARD_SLASH_END_DELETE, keyword));
			return close();
		} else {
			token = this.moveToNextToken;
		}

		keyword.lastToken = token;

		const node = new DeleteProperty(keyword);

		if (sameLine(keyword.tokenIndexes?.end, firstToken)) {
			const propertyName = this.isPropertyName();
			if (!propertyName) {
				this.issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, node));
			}

			node.propertyName = propertyName ?? null;
		} else {
			this.issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, keyword));
		}

		const lastToken = this.endStatment();
		node.lastToken = lastToken;
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
						this.arrayValues(dtcProperty) ||
						this.processByteStringValue(dtcProperty)) ??
					null
				);
			};
			const value = [getValue()];

			if (!value) {
				this.issues.push(genIssue(SyntaxIssue.VALUE, dtcProperty));
			}

			while (validToken(this.currentToken, LexerToken.COMMA)) {
				const start = this.prevToken;
				const end = this.currentToken;
				this.moveToNextToken;
				const next = getValue();
				if (start && next === null) {
					const node = new ASTBase(createTokenIndex(start, end));
					this.issues.push(genIssue(SyntaxIssue.VALUE, node));
				}
				value.push(next);
			}

			return value;
		};

		const values = getValues();

		this.mergeStack();
		const node = new PropertyValues(values, labels);
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

		const propValue = new StringValue(token.value, createTokenIndex(token));

		if (!token.value.match(/["']$/)) {
			this.issues.push(
				genIssue(
					token.value.startsWith('"') ? SyntaxIssue.DUOUBE_QUOTE : SyntaxIssue.SINGLE_QUOTE,
					propValue
				)
			);
		}

		const endLabels = this.processOptionalLablelAssign(true) ?? [];

		const node = new PropertyValue(propValue, endLabels);
		this.mergeStack();
		return node;
	}

	private arrayValues(dtcProperty: DtcProperty): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.currentToken;
		if (!validToken(firstToken, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		} else {
			this.moveToNextToken;
		}

		const value = this.processArrayValues(dtcProperty) ?? null;

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this.issues.push(genIssue(SyntaxIssue.GT_SYM, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		const endLabels2 = this.processOptionalLablelAssign(true) ?? [];

		this.mergeStack();
		const node = new PropertyValue(value, [...endLabels1, ...endLabels2]);
		node.fisrtToken = firstToken;
		node.lastToken = this.prevToken;
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
			this.issues.push(genIssue(SyntaxIssue.BYTESTRING, dtcProperty));
		}

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this.issues.push(genIssue(SyntaxIssue.SQUARE_CLOSE, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		numberValues.forEach((value) => {
			let len = 0;
			if (value.value?.tokenIndexes?.start === value.value?.tokenIndexes?.end) {
				len = value.value?.tokenIndexes?.start?.pos.len ?? 0;
			} else {
				const len =
					(value.value?.tokenIndexes?.start?.pos.len ?? 0) +
					(value.value?.tokenIndexes?.end?.pos.len ?? 0);
			}

			if (len % 2 !== 0) {
				this.issues.push(genIssue(SyntaxIssue.BYTESTRING_EVEN, value));
			}
		});

		const endLabels2 = this.processOptionalLablelAssign(true) ?? [];

		this.mergeStack();
		const byteString = new ByteStringValue(numberValues ?? []);

		const node = new PropertyValue(byteString, [...endLabels1, ...endLabels2]);
		node.fisrtToken = firstToken;
		byteString.lastToken = this.prevToken;
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
				this.processLabledDec(false) ||
				this.processLabledExpression(true, false)
		);

		const node = new ArrayValues(result);
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
		this.mergeStack();
		return node;
	}

	private processHex(): NumberValue | undefined {
		this.enqueToStack();

		const validStart = this.checkConcurrentTokens([validateValue('0'), validateValue('x')]);

		if (!validStart.length) {
			this.popStack();
			return;
		}

		const validValue = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.HEX].map(validateToken)
		);

		if (!validValue.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(validValue.map((v) => v.value).join(''), 16);
		const numbeValue = new NumberValue(
			num,
			createTokenIndex(validStart[0], validValue.at(-1))
		);

		this.mergeStack();
		return numbeValue;
	}

	private processHexString(): LabledValue<NumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign(false);
		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.HEX, LexerToken.HEX].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(valid.map((v) => v.value).join(''), 16);
		const numbeValue = new NumberValue(num, createTokenIndex(valid[0], valid.at(-1)));

		const node = new LabledValue(numbeValue, labels);
		this.mergeStack();
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
		this.mergeStack();
		return node;
	}

	private processDec(): NumberValue | undefined {
		this.enqueToStack();

		const valid = this.consumeAnyConcurrentTokens([LexerToken.DIGITS].map(validateToken));

		if (!valid.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(valid.map((v) => v.value).join(''), 10);
		const numbeValue = new NumberValue(num, createTokenIndex(valid[0], valid.at(-1)));

		this.mergeStack();
		return numbeValue;
	}

	private processCIdentifier(): CIdentifier | undefined {
		this.enqueToStack();

		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.LETTERS, LexerToken.UNDERSCOURE].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return undefined;
		}

		const name = valid.map((v) => v.value).join('');

		if (!name.match(/^[_A-Za-z]/)) {
			this.popStack();
			return;
		}

		const idnetifier = new CIdentifier(name, createTokenIndex(valid[0], valid.at(-1)));

		this.mergeStack();
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

		if (!expression) {
			this.popStack();
			return;
		}

		const node = new LabledValue(expression, labels);
		this.mergeStack();
		return node;
	}

	private isOperator(): Operator | undefined {
		this.enqueToStack();
		const start = this.moveToNextToken;

		if (!start) {
			this.popStack();
			return;
		}

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
		} else if (validToken(start, LexerToken.HASH)) {
			if (validToken(this.currentToken, LexerToken.HASH)) {
				operator = OperatorType.C_CONCAT;
				end = this.moveToNextToken;
			}
		}

		if (operator) {
			const node = new Operator(operator, createTokenIndex(start, end));
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
			if (
				!validToken(this.currentToken, LexerToken.COMMA) &&
				!validToken(this.currentToken, LexerToken.ROUND_CLOSE)
			) {
				this.issues.push(genIssue(SyntaxIssue.MISSING_COMMA, exp));
			} else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				token = this.moveToNextToken;
			}
			exp = this.processExpression();
		}

		if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
			this.issues.push(
				genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? identifier)
			);
		} else {
			token = this.moveToNextToken;
		}

		const node = new FunctionCall(identifier, params);
		this.mergeStack();
		return node;
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
			this.processHex() ||
			this.processDec();
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
					this.issues.push(genIssue(SyntaxIssue.EXPECTED_EXPRESSION, operator));
				} else {
					expression = new ComplexExpression(expression, {
						operator,
						expression: nextExpression,
					});
				}
			}

			if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				this.issues.push(genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, operator ?? expression));
			} else {
				token = this.moveToNextToken;
			}
		}

		this.mergeStack();
		return expression;
	}

	private isLabelRef(slxBase?: ASTBase): LabelRef | undefined {
		this.enqueToStack();
		const firstToken = this.currentToken;
		if (!validToken(firstToken, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		} else {
			this.moveToNextToken;
		}

		const labelName = this.isLabelName();
		if (!labelName) {
			const node = new LabelRef(null);
			this.issues.push(genIssue(SyntaxIssue.LABEL_NAME, slxBase ?? node));
			node.fisrtToken = firstToken;
			this.mergeStack();
			return node;
		}

		const node = new LabelRef(labelName);
		node.fisrtToken = firstToken;
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
		this.mergeStack();
		return node;
	}

	private processRefValue(
		acceptLabelName: boolean,
		dtcProperty: DtcProperty
	): LabledValue<LabelRef | NodePathRef> | undefined {
		this.enqueToStack();
		const labels = this.processOptionalLablelAssign(acceptLabelName);
		const firstToken = this.currentToken;
		if (!validToken(this.currentToken, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		const nodePath = this.processNodePathRef();

		if (nodePath !== undefined) {
			const node = new LabledValue(nodePath, labels);
			this.mergeStack();
			return node;
		}

		const labelRef = this.isLabelRef(dtcProperty);
		if (labelRef === undefined) {
			this.issues.push(
				genIssue([SyntaxIssue.LABEL_NAME, SyntaxIssue.NODE_PATH], dtcProperty)
			);

			const node = new LabledValue<LabelRef>(null, labels);
			node.fisrtToken = labels.at(0)?.fisrtToken ?? firstToken;
			this.mergeStack();
			return node;
		}

		const node = new LabledValue(labelRef, labels);
		node.fisrtToken = labels.at(0)?.fisrtToken ?? firstToken;
		this.mergeStack();
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
			this.issues.push(genIssue(SyntaxIssue.FORWARD_SLASH_START_PATH, nodePath));
		}

		if (first) {
			nodePath.fisrtToken = firstToken;
		}

		const nodeName = this.isNodeName();
		if (!nodeName) {
			this.issues.push(genIssue(SyntaxIssue.NODE_NAME, nodePath));
		}

		nodePath.lastToken = nodeName?.lastToken ?? firstToken;

		nodePath.addPath(nodeName ?? null);

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
			this.issues.push(genIssue(SyntaxIssue.CURLY_CLOSE, node));
		} else {
			this.moveToNextToken;
		}

		node.fisrtToken = firstToken;
		node.lastToken = lastToken ?? this.prevToken;

		const nodePathRange = nodePath ? toRange(nodePath) : undefined;
		if (
			nodePathRange &&
			beforPath &&
			afterPath &&
			(beforPath.pos.col !== nodePathRange?.start.character - 1 ||
				afterPath.pos.col !== nodePathRange?.end.character)
		) {
			this.issues.push(genIssue(SyntaxIssue.NODE_PATH_WHITE_SPACE_NOT_ALLOWED, node));
		}

		this.mergeStack();
		return node;
	}

	get allAstItems(): ASTBase[] {
		return [...this.cPreprocessorParser.allAstItems, this.rootDocument, ...this.others];
	}
}
