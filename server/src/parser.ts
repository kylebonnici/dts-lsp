import { LexerToken, Position, Token } from './lexer';

enum Issues {
	VALUE,
	END_STATMENT,
	CURLY_OPEN,
	CURLY_CLOSE,
	OPEN_SQUARE,
	SQUARE_CLOSE,
	PROPERTY_NAME,
	NODE_NAME,
	NODE_ADDRESS,
	NODE_DEFINITION,
	PROPERTY_DEFINITION,
	NUMERIC_VALUE,
	NODE_PATH,
	NODE_REF,
	GT_SYM,
	LT_SYM,
	BYTESTRING,
	BYTESTRING_EVEN,
	DUOUBE_QUOTE,
	SINGLE_QUOTE,
	VALID_NODE_PATH,
	LABEL_NAME,
	FORWARD_SLASH_START_PATH,
}

type AllowNodeDef = 'Both' | 'Ref' | 'Name';

interface Issue {
	issues: Issues | Issues[];
	pos: Position;
	priority: number;
	fix?: string;
}

interface TokenIndexes {
	start: number;
	end: number;
}

class DocumentNode {
	public children: DocumentNode[] = [];

	constructor(public tokenIndexes?: TokenIndexes) {}
}

class DtcBaseNode extends DocumentNode {
	constructor(tokenIndexes: TokenIndexes) {
		super(tokenIndexes);
	}
}
class DtcNode extends DtcBaseNode {
	constructor(
		tokenIndexes: TokenIndexes,
		public readonly nameOrRef: string | null,
		public readonly ref: boolean,
		public readonly labels: string[] = [],
		public readonly address?: number
	) {
		super(tokenIndexes);
	}
}

class DtcProperty extends DocumentNode {
	constructor(
		tokenIndexes: TokenIndexes,
		public readonly name: string | null,
		public readonly value?: PropertyValue,
		public readonly labels: string[] = []
	) {
		super(tokenIndexes);
	}
}

class DeleteNode extends DocumentNode {
	constructor(tokenIndexes: TokenIndexes, nodeNameOrRef: NodeName | string) {
		super(tokenIndexes);
	}
}

class DeleteProperty extends DocumentNode {
	constructor(tokenIndexes: TokenIndexes, propertyName: string) {
		super(tokenIndexes);
	}
}

type NodeName = { name: string; address?: number };
type NodePath = (string | null)[];

interface PropertyStringValue {
	type: 'STRING' | 'BYTESTRING';
	value: string | string[];
}

interface PropertyLabelRefValue {
	value: string | null;
	labels: string[];
}

interface PropertyNodePathValue {
	value: NodePath | undefined;
	labels: string[];
}

interface PropertyNumberValue {
	type: 'U32' | 'U64' | 'PROP_ENCODED_ARRAY';
	value: { value: number; type: 'DEC' | 'HEX'; labels: string[] }[];
}

type PropertyValue = {
	labels: string[];
	values: (
		| PropertyStringValue
		| PropertyNumberValue
		| PropertyLabelRefValue
		| PropertyNodePathValue
		| null
	)[];
};

class Parser {
	document: DocumentNode;
	positionStack: number[] = [];
	expected: Issue[] = [];

	constructor(private tokens: Token[]) {
		this.document = new DocumentNode();
		this.parse();
	}

	private parse() {
		this.positionStack.push(0);
		while (this.peekIndex() !== this.tokens.length - 1) {
			this.isRootNodeDefinition(this.document) ||
				this.isDeleteNode(this.document) ||
				this.isChildNode(this.document, 'Ref');
		}
	}

	private isRootNodeDefinition(parent: DocumentNode): boolean {
		this.enqueToStack();

		let nextToken: Token | undefined = this.nextNonWhiteSpaceToken;
		let expectedToken = LexerToken.FORWARD_SLASH;
		if (validToken(nextToken, expectedToken)) {
			this.popStack();
			return false;
		}

		nextToken = this.nextNonWhiteSpaceToken;
		expectedToken = LexerToken.CURLY_OPEN;
		if (validToken(nextToken, expectedToken)) {
			this.popStack();
			return false;
		}

		// from this point we can continue an report the expected tokens
		const child = new DtcBaseNode({ start: this.peekIndex(2), end: this.peekIndex() });
		parent.children.push(child);

		this.processNode(child, 'Name');
		this.nodeEnd();

		this.mergeStack();
		return true;
	}

	private nodeEnd() {
		const nextToken = this.peekNextToken();
		const expectedToken = LexerToken.CURLY_CLOSE;
		if (!validToken(nextToken, expectedToken)) {
			this.expected.push(this.genIssue(Issues.CURLY_CLOSE, nextToken));
		} else {
			this.nextNonWhiteSpaceToken;
		}

		this.endStatment();
	}

	private endStatment() {
		const nextToken = this.peekNextToken();
		const expectedToken = LexerToken.SEMICOLON;
		if (!validToken(nextToken, expectedToken)) {
			this.expected.push(this.genIssue(Issues.END_STATMENT, nextToken));
		} else {
			this.nextNonWhiteSpaceToken;
		}
	}

	private processNode(parent: DtcBaseNode, allow: AllowNodeDef): boolean {
		let found = false;
		let child = false;
		do {
			child =
				this.isChildNode(parent, allow) ||
				this.isProperty(parent) ||
				this.isDeleteNode(parent) ||
				this.isDeleteProperty(parent);
			found = found || child;
		} while (child);
		return found;
	}

	private processOptionalLablelAssign(): string[] {
		const labels: string[] = [];

		// Find all labels before node/property/value.....
		const token = this.peekNextToken();
		while (validToken(token, LexerToken.LABEL_ASSIGN)) {
			if (token?.value) {
				labels.push(token.value);
			}
			this.nextNonWhiteSpaceToken;
		}

		return labels;
	}

	private processNodeName(): NodeName | undefined {
		const token = this.peekNextToken();
		if (!validToken(token, LexerToken.NODE_NAME)) {
			return;
		} else {
			this.nextNonWhiteSpaceToken;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		const hasAddress = token.value.includes('@');
		const tmp = token.value.split('@');
		const name = tmp[0];
		const address = hasAddress ? Number.parseInt(tmp[1]) : undefined;

		// <nodeName>@
		if (hasAddress && Number.isNaN(address)) {
			this.expected.push(this.genIssue(Issues.NODE_ADDRESS, token));
		}

		return {
			name,
			address,
		};
	}

	private isChildNode(parent: DtcBaseNode, allow: AllowNodeDef): boolean {
		this.enqueToStack();

		const labels: string[] = this.processOptionalLablelAssign();

		let isRef = false;
		let nameOrRef: NodeName | string | null | undefined;

		if (allow === 'Both' || allow === 'Ref') {
			nameOrRef = this.isLabelRef();
		}

		if (nameOrRef) {
			isRef = true;
		} else if (allow === 'Both' || allow === 'Name') {
			nameOrRef = this.processNodeName();
			if (!nameOrRef) {
				if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
					// must be property then ....
					this.popStack();
					return false;
				}

				this.expected.push(
					this.genIssue([Issues.NODE_NAME, Issues.NODE_REF], this.currentToken)
				);
			}
		}

		const child = new DtcNode(
			{ start: this.peekIndex(2), end: this.peekIndex() },
			typeof nameOrRef === 'string' ? nameOrRef : nameOrRef?.name ?? null,
			isRef,
			labels,
			typeof nameOrRef === 'string' ? undefined : nameOrRef?.address
		);

		const expectedNode = nameOrRef && !(typeof nameOrRef === 'string');

		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				this.expected.push(this.genIssue(Issues.CURLY_OPEN, token));
			} else {
				// this could be a property
				this.popStack();
				return false;
			}
		}

		// syntax must be a node ....
		parent.children.push(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		this.nodeEnd();
		this.mergeStack();
		return true;
	}

	private isProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let name: string | null;
		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			if (labels.length) {
				// we have seme lables so we are expecing a property or a node then
				this.expected.push(
					this.genIssue([Issues.PROPERTY_DEFINITION, Issues.NODE_DEFINITION], token)
				);
				name = null;
				this.mergeStack();
				return false;
			} else {
				this.popStack();
				return false;
			}
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		name = token.value;
		let value: PropertyValue | undefined;

		if (validToken(this.peekNextToken(), LexerToken.ASSIGN_OPERATOR)) {
			this.nextNonWhiteSpaceToken;
			value = this.processValue();

			if (!value.values) {
				this.expected.push(this.genIssue(Issues.VALUE, token));
			}

			this.endStatment();
		}

		// create property object
		const child = new DtcProperty(
			{ start: this.peekIndex(2), end: this.peekIndex() },
			name,
			value,
			labels
		);

		parent.children.push(child);

		this.mergeStack();
		return true;
	}

	private isDeleteNode(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.DELETE_NODE)) {
			this.popStack();
			return false;
		}

		const nodeName = this.processNodeName();

		if (nodeName) {
			parent.children.push(
				new DeleteNode({ start: this.peekIndex(2), end: this.peekIndex() }, nodeName)
			);
		} else {
			const label = this.isLabelRef();
			if (label) {
				parent.children.push(
					new DeleteNode({ start: this.peekIndex(2), end: this.peekIndex() }, label)
				);
			}
		}

		this.endStatment();
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		let token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.DELETE_PROPERTY)) {
			this.popStack();
			return false;
		}

		token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			this.expected.push(this.genIssue(Issues.PROPERTY_NAME, token));
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		const propertyName = token.value;

		if (propertyName) {
			parent.children.push(
				new DeleteProperty(
					{ start: this.peekIndex(2), end: this.peekIndex() },
					propertyName
				)
			);
		}

		this.endStatment();
		this.mergeStack();
		return true;
	}

	private processValue(): PropertyValue {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		const getValues = () => {
			let value = [
				(this.processStringValue() ||
					this.processNumericNodePathOrRefValue() ||
					this.processByteStringValue()) ??
					null,
			];

			if (!value) {
				this.expected.push(this.genIssue(Issues.VALUE, this.currentToken));
			}

			if (validToken(this.peekNextToken(), LexerToken.COMMA)) {
				this.nextNonWhiteSpaceToken;
				const next = getValues();
				value = [...value, ...next];
			}

			return value;
		};

		const values = getValues();

		this.mergeStack();
		return { labels, values };
	}

	private processStringValue(): PropertyStringValue | undefined {
		this.enqueToStack();

		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.STRING)) {
			this.popStack();
			return;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		if (!token.value.match(/["']$/)) {
			this.expected.push(
				this.genIssue(
					token.value.endsWith('"') ? Issues.DUOUBE_QUOTE : Issues.SINGLE_QUOTE,
					token
				)
			);
		}

		const propValue: PropertyStringValue = {
			type: 'STRING',
			value: [token.value],
		};

		this.mergeStack();
		return propValue;
	}

	private processNumericNodePathOrRefValue():
		| PropertyNumberValue
		| PropertyLabelRefValue
		| PropertyNodePathValue
		| undefined {
		this.enqueToStack();

		let token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		}

		const value = this.processNumericValue() || this.processNodePathOrLabelRefValue();
		if (!value) {
			this.expected.push(
				this.genIssue([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH], token)
			);
			this.mergeStack();
			return;
		}

		token = this.peekNextToken();
		if (!validToken(token, LexerToken.GT_SYM)) {
			this.expected.push(this.genIssue(Issues.GT_SYM, token));
		} else {
			this.nextNonWhiteSpaceToken;
		}

		this.mergeStack();
		return value;
	}

	private processByteStringValue(): PropertyStringValue | undefined {
		this.enqueToStack();

		let token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.SQUARE_OPEN)) {
			this.popStack();
			return;
		}

		token = this.peekNextToken();
		if (!validToken(token, LexerToken.NUMBER)) {
			this.expected.push(this.genIssue(Issues.BYTESTRING, token));
			this.mergeStack();
			return;
		}

		token = this.nextNonWhiteSpaceToken;

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		if (token.value.length % 2 !== 0) {
			this.expected.push(this.genIssue(Issues.BYTESTRING_EVEN, token));
		}

		const value = token.value;

		token = this.peekNextToken();
		if (!validToken(this.peekNextToken(), LexerToken.SQUARE_CLOSE)) {
			this.expected.push(this.genIssue(Issues.SQUARE_CLOSE, token));
		} else {
			token = this.nextNonWhiteSpaceToken;
		}

		this.mergeStack();
		return { value, type: 'BYTESTRING' };
	}

	private processNumericValue(): PropertyNumberValue | undefined {
		this.enqueToStack();

		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.NUMBER)) {
			this.popStack();
			return;
		}

		const value = this.processHex() || this.processDec();

		if (value) {
			const nextValue = this.processHex() || this.processDec();
			if (nextValue) {
				value.type =
					value.value.length + nextValue.value.length === 2 ? 'U64' : 'PROP_ENCODED_ARRAY';
				value.value = [...value.value, ...nextValue.value];
			}
		}

		this.mergeStack();
		return value;
	}

	private processHex(): PropertyNumberValue | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();
		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.HEX)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return {
			value: [{ value: Number.parseInt(token.value, 16), type: 'HEX', labels }],
			type: 'U32',
		};
	}

	private processDec(): PropertyNumberValue | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();
		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.DIGITS)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return {
			value: [{ value: Number.parseInt(token.value, 10), type: 'DEC', labels }],
			type: 'U32',
		};
	}

	private isLabelRef(): string | undefined | null {
		this.enqueToStack();
		let token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.LABEL_NAME)) {
			this.expected.push(this.genIssue(Issues.LABEL_NAME, token));
			this.mergeStack();
			return null;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return token.value;
	}

	private processNodePathOrLabelRefValue():
		| PropertyLabelRefValue
		| PropertyNodePathValue
		| undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		if (!validToken(this.peekNextToken(), LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		const nodePath = this.processNodePath();

		if (nodePath !== undefined) {
			this.mergeStack();
			return {
				labels,
				value: nodePath,
			};
		}

		const labelRef = this.isLabelRef();
		if (labelRef === undefined) {
			this.expected.push(this.genIssue([Issues.LABEL_NAME, Issues.NODE_PATH]));
			this.popStack();

			// we found &{ then this must be followed by a path but it is not
			if (validToken(this.peekNextToken(2), LexerToken.CURLY_OPEN)) {
				return {
					value: [] as NodePath,
					labels,
				};
			}
			return {
				// we found & then this must be followed by a label name
				value: null,
				labels,
			};
		}

		this.mergeStack();
		return {
			labels,
			value: labelRef,
		};
	}

	private processNodeRefPath(first = true): NodePath | undefined {
		this.enqueToStack();

		const token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			if (!first) {
				this.popStack();
				return;
			}
			this.expected.push(this.genIssue(Issues.FORWARD_SLASH_START_PATH));
		}

		const nodeName = this.processNodeName();
		if (!nodeName) {
			this.expected.push(this.genIssue(Issues.NODE_NAME));
		}

		const name = nodeName
			? nodeName?.address
				? `${nodeName.name}@${nodeName.address}`
				: nodeName.name
			: null;

		const next = this.processNodeRefPath(false) ?? [];
		const path = [name, ...next];

		this.mergeStack();
		return path;
	}

	private processNodePath() {
		this.enqueToStack();

		let token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		token = this.nextNonWhiteSpaceToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			// migh be a node ref such as &nodeLabel
			this.popStack();
			return;
		}

		// now we must have a valid path
		// /soc/node/node2@223/....
		const path = this.processNodeRefPath();

		this.mergeStack();
		return path;
	}

	private get nextNonWhiteSpaceToken() {
		while (validToken(this.tokens[this.peekIndex()], LexerToken.WHITE_SPACE)) {
			this.moveStackIndex();
		}

		return this.tokens.at(this.peekIndex());
	}

	private moveToEndStatement() {
		this.moveToToken([LexerToken.SEMICOLON]);
	}

	private moveToToken(tokens: LexerToken[]) {
		while (!tokens.some((token) => validToken(this.tokens[this.peekIndex()], token))) {
			this.moveStackIndex();
		}

		return this.tokens.at(this.peekIndex());
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

		this.positionStack[this.peekIndex()] = value;
	}

	private peekIndex(depth = 1) {
		const peek = this.positionStack.at(-1 * depth);
		if (peek === undefined) {
			throw new Error('Index out of bounds');
		}

		return peek;
	}

	get currentToken() {
		return this.tokens[this.peekIndex()];
	}

	private peekNextToken(forward = 1) {
		this.enqueToStack();
		for (let i = 1; i < forward; i++) {
			this.nextNonWhiteSpaceToken;
		}
		const token = this.nextNonWhiteSpaceToken;
		this.popStack();

		return token;
	}

	private moveStackIndex() {
		if (this.positionStack[this.positionStack.length - 1] === undefined) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1]++;
	}

	private genIssue = (expectedToken: Issues | Issues[], token?: Token): Issue => ({
		issues: expectedToken,
		pos: token ? token.pos : this.tokens.at(-1)!.pos,
		priority: this.positionStack.length,
	});
}

const validToken = (token: Token | undefined, expected: LexerToken) =>
	token?.tokens.some((t) => t === expected);
