import { LexerToken, Position, Token } from './lexer';

export enum Issues {
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

export interface Issue {
	issues: Issues[];
	pos: Position;
	priority: number;
}

export interface TokenIndexes {
	start?: Position;
	end?: Position;
}

export enum SLXType {
	SLX,
	ROOT_DTC,
	DTC_NODE,
	PROPERTY,
	DELETE_PROPERTY,
	DELETE_NODE,
	VALUE,
}

export class DocumentNode {
	public children: DocumentNode[] = [];
	protected _type: SLXType = SLXType.SLX;
	public tokenIndexes?: TokenIndexes;

	get type() {
		return this._type;
	}

	constructor() {}
}

export class DtcBaseNode extends DocumentNode {
	constructor() {
		super();
		this._type = SLXType.ROOT_DTC;
	}
}
export class DtcNode extends DtcBaseNode {
	constructor(
		public readonly nameOrRef: string | null,
		public readonly ref: boolean,
		public readonly labels: string[] = [],
		public readonly address?: number
	) {
		super();
		this._type = SLXType.DTC_NODE;
	}
}

export class DtcProperty extends DocumentNode {
	constructor(
		public readonly name: string | null,
		public readonly value?: PropertyValue,
		public readonly labels: string[] = []
	) {
		super();
		this._type = SLXType.PROPERTY;
	}
}

export class DeleteNode extends DocumentNode {
	constructor(public readonly nodeNameOrRef: NodeName | string) {
		super();
	}
}

export class DeleteProperty extends DocumentNode {
	constructor(public readonly propertyName: string) {
		super();
	}
}

export type NodeName = { name: string; address?: number };
export type NodePath = (string | null)[];

export interface PropertyStringValue {
	type: 'STRING' | 'BYTESTRING';
	value: string | string[];
}

export interface PropertyLabelRefValue {
	value: string | null;
	labels: string[];
}

export interface PropertyNodePathValue {
	value: NodePath | undefined;
	labels: string[];
}

export interface PropertyNumberValue {
	type: 'U32' | 'U64' | 'PROP_ENCODED_ARRAY';
	value: { value: number; type: 'DEC' | 'HEX'; labels: string[] }[];
}

export type PropertyValue = {
	labels: string[];
	values: (
		| PropertyStringValue
		| PropertyNumberValue
		| PropertyLabelRefValue
		| PropertyNodePathValue
		| null
	)[];
};

type Result<T> = {
	firstToken?: Token;
	value: T;
	lastToken?: Token;
};

export class Parser {
	document: DocumentNode;
	positionStack: number[] = [];
	issues: Issue[] = [];

	constructor(private tokens: Token[]) {
		this.document = new DocumentNode();
		this.parse();
	}

	private parse() {
		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		while (this.peekIndex() < this.tokens.length - 1) {
			this.isRootNodeDefinition(this.document) ||
				this.isDeleteNode(this.document) ||
				this.isChildNode(this.document, 'Ref');
		}

		if (this.positionStack.length !== 1) {
			throw new Error('Incorrect final stack size');
		}
	}

	private isRootNodeDefinition(parent: DocumentNode): boolean {
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
		const child = new DtcBaseNode();
		parent.children.push(child);
		this.processNode(child, 'Name');

		const lastToken = this.nodeEnd() ?? nextToken;
		child.tokenIndexes = { start: firstToken.pos, end: lastToken.pos };
		this.mergeStack();
		return true;
	}

	private nodeEnd() {
		const nextToken = this.peekNextToken();
		const expectedToken = LexerToken.CURLY_CLOSE;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, this.prevToken));
		} else {
			this.moveToNextToken;
		}

		return this.endStatment();
	}

	// TODO
	// no ref
	// c presosessor
	// terninary

	private endStatment() {
		const nextToken = this.peekNextToken();
		const expectedToken = LexerToken.SEMICOLON;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.END_STATMENT, this.prevToken));
			return this.prevToken;
		}
		this.moveToNextToken;
		return nextToken;
	}

	private processNode(parent: DtcBaseNode, allow: AllowNodeDef): boolean {
		let found = false;
		let child = false;
		do {
			child =
				this.isProperty(parent) ||
				this.isDeleteNode(parent) ||
				this.isDeleteProperty(parent) ||
				this.isChildNode(parent, allow);
			found = found || child;
		} while (child);
		return found;
	}

	private processOptionalLablelAssign(): Result<string[]> {
		const labels: string[] = [];

		// Find all labels before node/property/value.....
		const firstToken = this.peekNextToken();
		let token = firstToken;
		while (validToken(token, LexerToken.LABEL_ASSIGN)) {
			if (token?.value) {
				labels.push(token.value);
			}
			this.moveToNextToken;
			token = this.peekNextToken();
		}
		const lastToken = this.peekNextToken();

		return { firstToken, value: labels, lastToken };
	}

	private processNodeName(): Result<NodeName> | undefined {
		const token = this.peekNextToken();
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

		// <nodeName>@
		if (hasAddress && Number.isNaN(address)) {
			this.issues.push(this.genIssue(Issues.NODE_ADDRESS, token));
		}

		return {
			firstToken: token,
			value: {
				name,
				address,
			},
			lastToken: token,
		};
	}

	private isChildNode(parent: DtcBaseNode, allow: AllowNodeDef): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let isRef = false;
		let nameOrRef: Result<NodeName | string | null> | undefined;

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

				this.issues.push(
					this.genIssue([Issues.NODE_NAME, Issues.NODE_REF], this.currentToken)
				);
			}
		}

		const child = new DtcNode(
			(typeof nameOrRef?.value === 'string' ? nameOrRef.value : nameOrRef?.value?.name) ??
				null,
			isRef,
			labels.value,
			typeof nameOrRef?.value === 'string' ? undefined : nameOrRef?.value?.address
		);

		const expectedNode = nameOrRef && !(typeof nameOrRef === 'string');

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				this.issues.push(this.genIssue(Issues.CURLY_OPEN, token));
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

		const lastToken = this.nodeEnd();

		child.tokenIndexes = {
			start: labels.firstToken?.pos,
			end: (lastToken ?? this.currentToken)?.pos,
		};

		this.mergeStack();
		return true;
	}

	private isProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let name: string | null;
		const token = this.moveToNextToken;
		const firstToken = labels.firstToken ?? token;

		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			if (labels.value.length) {
				// we have seme lables so we are expecing a property or a node then
				this.issues.push(
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
		let result: Result<PropertyValue> | undefined;

		if (validToken(this.peekNextToken(), LexerToken.ASSIGN_OPERATOR)) {
			this.moveToNextToken;
			result = this.processValue();

			if (!result.value.values) {
				this.issues.push(this.genIssue(Issues.VALUE, token));
			}
		}

		const lastToken = this.endStatment();

		// create property object
		const child = new DtcProperty(name, result?.value, labels.value);
		child.tokenIndexes = {
			start: firstToken?.pos,
			end: (lastToken ?? this.currentToken).pos,
		};

		parent.children.push(child);

		this.mergeStack();
		return true;
	}

	private isDeleteNode(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.DELETE_NODE)) {
			this.popStack();
			return false;
		}

		const nodeName = this.processNodeName();

		if (nodeName) {
			const node = new DeleteNode(nodeName.value);
			// TODO node.tokenIndexes = {}
			parent.children.push(node);
		} else {
			const label = this.isLabelRef();
			if (label?.value) {
				const node = new DeleteNode(label.value);
				// TODO node.tokenIndexes = { start: this.peekIndex(2), end: this.peekIndex() }
				parent.children.push(node);
			}
		}

		this.endStatment();
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcBaseNode): boolean {
		this.enqueToStack();

		let token = this.moveToNextToken;
		if (!validToken(token, LexerToken.DELETE_PROPERTY)) {
			this.popStack();
			return false;
		}

		token = this.moveToNextToken;
		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			this.issues.push(this.genIssue(Issues.PROPERTY_NAME, token));
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		const propertyName = token.value;

		if (propertyName) {
			const node = new DeleteProperty(propertyName);
			// node.tokenIndexes = 	{ start: this.peekIndex(2), end: this.peekIndex() },
			parent.children.push(node);
		}

		this.endStatment();
		this.mergeStack();
		return true;
	}

	private processValue(): Result<PropertyValue> {
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
				this.issues.push(this.genIssue(Issues.VALUE, this.currentToken));
			}

			if (validToken(this.peekNextToken(), LexerToken.COMMA)) {
				this.moveToNextToken;
				const next = getValues();
				value = [...value, ...next];
			}

			return value;
		};

		const results = getValues();

		this.mergeStack();
		return {
			firstToken: labels.firstToken ?? results.at(0)?.firstToken,
			value: { labels: labels.value, values: results.map((r) => r?.value ?? null) },
			lastToken: results.at(-1)?.lastToken,
		};
	}

	private processStringValue(): Result<PropertyStringValue> | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.STRING)) {
			this.popStack();
			return;
		}

		if (!token?.value) {
			throw new Error('Token must have value');
		}

		if (!token.value.match(/["']$/)) {
			this.issues.push(
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
		return { firstToken: token, value: propValue, lastToken: token };
	}

	private processNumericNodePathOrRefValue():
		| Result<PropertyNumberValue | PropertyLabelRefValue | PropertyNodePathValue>
		| undefined {
		this.enqueToStack();

		let token = this.moveToNextToken;
		if (!validToken(token, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		}

		const value = this.processNumericValue() || this.processNodePathOrLabelRefValue();
		if (!value) {
			this.issues.push(
				this.genIssue([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH], token)
			);
			this.mergeStack();
			return;
		}

		token = this.peekNextToken();
		if (!validToken(token, LexerToken.GT_SYM)) {
			this.issues.push(this.genIssue(Issues.GT_SYM, token));
		} else {
			this.moveToNextToken;
		}

		this.mergeStack();
		return value;
	}

	private processByteStringValue(): Result<PropertyStringValue> | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.SQUARE_OPEN)) {
			this.popStack();
			return;
		}

		token = this.peekNextToken();
		if (!validToken(token, LexerToken.NUMBER)) {
			this.issues.push(this.genIssue(Issues.BYTESTRING, token));
			this.mergeStack();
			return;
		}

		token = this.moveToNextToken;

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		if (token.value.length % 2 !== 0) {
			this.issues.push(this.genIssue(Issues.BYTESTRING_EVEN, token));
		}

		const value = token.value;

		token = this.peekNextToken();
		if (!validToken(this.peekNextToken(), LexerToken.SQUARE_CLOSE)) {
			this.issues.push(this.genIssue(Issues.SQUARE_CLOSE, token));
		} else {
			token = this.moveToNextToken;
		}

		this.mergeStack();
		return { firstToken, value: { value, type: 'BYTESTRING' }, lastToken: this.prevToken };
	}

	private processNumericValue(): Result<PropertyNumberValue> | undefined {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.NUMBER)) {
			this.popStack();
			return;
		}

		const result = this.processHex() || this.processDec();

		if (result) {
			const nextValue = this.processHex() || this.processDec();
			if (nextValue?.value) {
				result.value.type =
					result.value.value.length + nextValue.value.value.length === 2
						? 'U64'
						: 'PROP_ENCODED_ARRAY';
				result.value.value = [...result.value.value, ...nextValue.value.value];
			}
		}

		this.mergeStack();
		return result
			? { firstToken: undefined, value: result.value, lastToken: undefined }
			: undefined;
	}

	private processHex(): Result<PropertyNumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();
		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.HEX)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return {
			firstToken: token,
			value: {
				value: [
					{ value: Number.parseInt(token.value, 16), type: 'HEX', labels: labels.value },
				],
				type: 'U32',
			},
			lastToken: token,
		};
	}

	private processDec(): Result<PropertyNumberValue> | undefined {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();
		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.DIGITS)) {
			this.popStack();
			return;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return {
			firstToken: token,
			value: {
				value: [
					{ value: Number.parseInt(token.value, 10), type: 'DEC', labels: labels.value },
				],
				type: 'U32',
			},
			lastToken: token,
		};
	}

	private isLabelRef(): Result<string | null> | undefined {
		this.enqueToStack();
		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		token = this.moveToNextToken;
		if (!validToken(token, LexerToken.LABEL_NAME)) {
			this.issues.push(this.genIssue(Issues.LABEL_NAME, token));
			this.mergeStack();
			return { firstToken: undefined, value: null, lastToken: undefined };
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		this.mergeStack();
		return { firstToken, value: token.value, lastToken: token };
	}

	private processNodePathOrLabelRefValue():
		| Result<PropertyLabelRefValue | PropertyNodePathValue>
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
				firstToken: labels.firstToken ?? nodePath.firstToken,
				value: {
					labels: labels.value,
					value: nodePath.value,
				},
				lastToken: nodePath.lastToken,
			};
		}

		const labelRef = this.isLabelRef();
		if (labelRef === undefined) {
			this.issues.push(this.genIssue([Issues.LABEL_NAME, Issues.NODE_PATH]));
			this.popStack();

			// we found &{ then this must be followed by a path but it is not
			if (validToken(this.peekNextToken(2), LexerToken.CURLY_OPEN)) {
				return {
					firstToken: labels.firstToken ?? this.currentToken,
					value: {
						value: [] as NodePath,
						labels: labels.value,
					},
					lastToken: labels.lastToken ?? this.currentToken,
				};
			}
			return {
				firstToken: labels.firstToken ?? this.currentToken,
				value: {
					// we found & then this must be followed by a label name
					value: null,
					labels: labels.value,
				},
				lastToken: labels.lastToken ?? this.currentToken,
			};
		}

		this.mergeStack();
		return {
			firstToken: labels.firstToken ?? labelRef.firstToken,
			value: {
				labels: labels.value,
				value: labelRef.value,
			},
			lastToken: labelRef.lastToken,
		};
	}

	private processNodeRefPath(first = true): Result<NodePath> | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.FORWARD_SLASH)) {
			if (!first) {
				this.popStack();
				return;
			}
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_START_PATH));
		}

		const nodeName = this.processNodeName();
		if (!nodeName) {
			this.issues.push(this.genIssue(Issues.NODE_NAME));
		}

		const name = nodeName?.value
			? nodeName.value?.address
				? `${nodeName.value.name}@${nodeName.value.address}`
				: nodeName.value.name
			: null;

		const next = this.processNodeRefPath(false);
		const path = [name, ...(next?.value ?? [])];

		this.mergeStack();
		return { firstToken, value: path, lastToken: nodeName?.lastToken };
	}

	private processNodePath(): Result<NodePath> | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		token = this.moveToNextToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			// migh be a node ref such as &nodeLabel
			this.popStack();
			return;
		}

		// now we must have a valid path
		// /soc/node/node2@223/....
		const result = this.processNodeRefPath();

		if (validToken(this.peekNextToken(), LexerToken.CURLY_CLOSE)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, this.prevToken));
		} else {
			token = this.moveToNextToken;
		}

		if (result) {
			result.firstToken = firstToken;
			result.lastToken = token;
		}
		this.mergeStack();
		return result;
	}

	private get moveToNextToken() {
		// while (validToken(this.tokens[this.peekIndex()], LexerToken.WHITE_SPACE)) {
		// 	this.moveStackIndex();
		// }

		const token = this.tokens.at(this.peekIndex());
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
		return this.tokens[this.peekIndex()];
	}

	get prevToken() {
		return this.tokens[this.peekIndex() - 1];
	}

	private peekNextToken(forward = 1) {
		this.enqueToStack();
		for (let i = 1; i < forward; i++) {
			this.moveToNextToken;
		}
		const token = this.moveToNextToken;
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
		issues: Array.isArray(expectedToken) ? expectedToken : [expectedToken],
		pos: token ? token.pos : this.tokens.at(-1)!.pos,
		priority: this.positionStack.length,
	});
}

const validToken = (token: Token | undefined, expected: LexerToken) =>
	token?.tokens.some((t) => t === expected);
