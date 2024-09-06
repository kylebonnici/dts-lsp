import { LexerToken, Token } from './lexer';

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
	BYTESTRING_HEX,
	FORWARD_SLASH_END_DELETE,
	UNKNOWN,
}

type AllowNodeDef = 'Both' | 'Ref' | 'Name';

export interface Issue {
	issues: Issues[];
	token?: Token;
	priority: number;
}

export interface TokenIndexes {
	start?: Token;
	end?: Token;
}

export abstract class Base {
	public tokenIndexes?: TokenIndexes;
	public parent?: BaseNode;
}

export class BaseNode extends Base {
	public nodes: DtcNode[] = [];
	public deleteNodes: DeleteNode[] = [];
}

export class DtcNode extends BaseNode {
	public properties: DtcProperty[] = [];
	public deleteProperties: DeleteProperty[] = [];

	constructor() {
		super();
	}
}
export class DtcChilNode extends DtcNode {
	constructor(
		public readonly nameOrRef: NodeName | LabelRef | null,
		public readonly ref: boolean,
		public readonly labels: LabelNode[] = []
	) {
		super();
	}
}

export class DtcProperty extends Base {
	constructor(
		public readonly propertyName: PropertyName,
		public readonly values: PropertyValues | null,
		public readonly labels: LabelNode[] = []
	) {
		super();
	}
}

export class DeleteNode extends Base {
	constructor(public readonly nodeNameOrRef: NodeName | LabelRef | null) {
		super();
	}
}

export class PropertyName extends Base {
	constructor(public readonly name: string | null) {
		super();
	}
}

export class DeleteProperty extends Base {
	constructor(public readonly propertyName: PropertyName) {
		super();
	}
}

export class LabelNode extends Base {
	constructor(public readonly label: string) {
		super();
	}
}

export class NodeName extends Base {
	constructor(public readonly name: string, public readonly address?: number) {
		super();
	}
}

export class NodePath extends Base {
	pathParts: (NodeName | null)[] = [];

	constructor() {
		super();
	}
}

export class LabelRef extends Base {
	constructor(public readonly ref: string | null) {
		super();
	}
}

export class StringValue extends Base {
	constructor(public readonly value: string) {
		super();
	}
}

export class ByteStringValue extends Base {
	constructor(public readonly values: (NumberValue | null)[]) {
		super();
	}
}

export class LabelRefValue extends Base {
	constructor(public readonly value: string | null, public readonly labels: LabelNode[]) {
		super();
	}
}

export class NodePathValue extends Base {
	constructor(
		public readonly path: NodePathRef | null,
		public readonly labels: LabelNode[]
	) {
		super();
	}
}

export class NodePathRef extends Base {
	constructor(public readonly path: NodePath | null) {
		super();
	}
}

type AllValueType =
	| NodePathValue
	| LabelRefValue
	| StringValue
	| ByteStringValue
	| NumberValues
	| LabelRef
	| null;
export class PropertyValues extends Base {
	constructor(
		public readonly values: (PropertyValue | null)[],
		public readonly labels: LabelNode[]
	) {
		super();
	}
}

export class PropertyValue extends Base {
	constructor(public readonly value: AllValueType, public readonly endLabels: LabelNode[]) {
		super();
	}
}

export class NumberValues extends Base {
	constructor(public readonly values: NumberValue[]) {
		super();
	}
}

export class NumberValue extends Base {
	constructor(public readonly value: number, public readonly labels: LabelNode[]) {
		super();
	}
}

export class Parser {
	rootDTCNode = new DtcNode();
	positionStack: number[] = [];
	issues: Issue[] = [];
	unhandledNode = new DtcNode();

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
					this.isRootNodeDefinition(this.rootDTCNode) ||
					this.isDeleteNode(this.rootDTCNode) ||
					// not valid syntax but we leave this for the next layer to proecess
					this.isProperty(this.unhandledNode) ||
					this.isDeleteProperty(this.unhandledNode) ||
					// Valid use case
					this.isChildNode(this.rootDTCNode, 'Both')
				)
			) {
				this.issues.push(this.genIssue(Issues.UNKNOWN, this.moveToNextToken));
			}
		};

		while (!this.done) {
			process();
		}

		if (this.positionStack.length !== 1) {
			throw new Error('Incorrect final stack size');
		}
	}

	private isRootNodeDefinition(parent: BaseNode): boolean {
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
		const child = new DtcNode();
		parent.nodes.push(child);
		this.processNode(child, 'Both');

		const lastToken = this.nodeEnd() ?? nextToken;
		child.tokenIndexes = { start: firstToken, end: lastToken };
		this.mergeStack();
		return true;
	}

	private nodeEnd() {
		const nextToken = this.currentToken;
		const expectedToken = LexerToken.CURLY_CLOSE;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, this.prevToken));
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

	// TODO
	// no ref
	// c presosessor
	// terninary

	private endStatment() {
		const nextToken = this.currentToken;
		const expectedToken = LexerToken.SEMICOLON;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.END_STATMENT, this.prevToken));
			return this.prevToken;
		}
		this.moveToNextToken;
		return nextToken;
	}

	private processNode(parent: DtcNode, allow: AllowNodeDef): boolean {
		if (this.done) return false;

		let found = false;
		let child = false;
		do {
			child =
				this.isProperty(parent) ||
				this.isDeleteNode(parent) ||
				this.isDeleteProperty(parent) ||
				this.isChildNode(parent, allow);

			if (!child && !this.isNodeEnd() && !this.done) {
				this.issues.push(this.genIssue(Issues.UNKNOWN, this.moveToNextToken));
			} else {
				if (this.done) {
					break;
				}
			}
			found = found || child;
		} while (!this.isNodeEnd());
		return found;
	}

	private processOptionalLablelAssign(): LabelNode[] {
		const labels: LabelNode[] = [];

		// Find all labels before node/property/value.....
		let token = this.currentToken;
		while (validToken(token, LexerToken.LABEL_ASSIGN)) {
			if (token?.value) {
				const node = new LabelNode(token.value);
				node.tokenIndexes = { start: token, end: token };
				labels.push(node);
			}
			this.moveToNextToken;
			token = this.currentToken;
		}

		return labels;
	}

	private processNodeName(): NodeName | undefined {
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
			this.issues.push(this.genIssue(Issues.NODE_ADDRESS, token));
		}

		return node;
	}

	private isChildNode(parentNode: BaseNode, allow: AllowNodeDef): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let isRef = false;
		let nameOrRef: NodeName | LabelRef | undefined;

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
		const child = new DtcChilNode(nameOrRef ?? null, isRef, labels);
		parentNode.nodes.push(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		const lastToken = this.nodeEnd();

		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? nameOrRef?.tokenIndexes?.start,
			end: lastToken ?? this.prevToken,
		};

		this.mergeStack();
		return true;
	}

	private isProperty(parent: DtcNode): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let name: string | null;
		const token = this.moveToNextToken;

		if (!validToken(token, LexerToken.PROPERTY_NAME)) {
			if (labels.length) {
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
		let result: PropertyValues | undefined;
		if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
			this.moveToNextToken;
			result = this.processValue();

			if (!result.values.filter((v) => !!v).length) {
				this.issues.push(this.genIssue(Issues.VALUE, token));
			}
		}

		const lastToken = this.endStatment();

		const propertyName = new PropertyName(name);
		propertyName.tokenIndexes = { start: token, end: token };

		// create property object
		const child = new DtcProperty(propertyName, result ?? null, labels);
		child.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? token,
			end: lastToken ?? this.prevToken,
		};

		parent.properties.push(child);

		this.mergeStack();
		return true;
	}

	private isDeleteNode(parent: DtcNode): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		token = this.moveToNextToken;
		if (token?.value !== 'delete-node') {
			this.popStack();
			return false;
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, token));
		} else {
			token = this.moveToNextToken;
		}

		const labelRef = this.isLabelRef();
		const nodeName = labelRef ? undefined : this.processNodeName();

		if (!nodeName && !labelRef) {
			this.issues.push(this.genIssue([Issues.NODE_NAME, Issues.NODE_REF], token));
		}

		const lastToken = this.endStatment();
		const node = new DeleteNode(labelRef ?? nodeName ?? null);
		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.deleteNodes.push(node);
		this.mergeStack();
		return true;
	}

	private isDeleteProperty(parent: DtcNode): boolean {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.FORWARD_SLASH)) {
			this.popStack();
			return false;
		}

		token = this.moveToNextToken;
		if (token?.value !== 'delete-property') {
			this.popStack();
			return false;
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, token));
		} else {
			token = this.moveToNextToken;
		}

		if (!validToken(this.currentToken, LexerToken.PROPERTY_NAME)) {
			this.issues.push(this.genIssue(Issues.PROPERTY_NAME, token));
		} else {
			token = this.moveToNextToken;

			if (!token?.value) {
				throw new Error('Token must have value');
			}
		}

		const propertyName = new PropertyName(token?.value ?? null);
		propertyName.tokenIndexes = { start: token, end: token };

		const node = new DeleteProperty(propertyName);

		const lastToken = this.endStatment();
		node.tokenIndexes = { start: firstToken, end: lastToken };
		parent.deleteProperties.push(node);

		this.mergeStack();
		return true;
	}

	private processValue(): PropertyValues {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		const getValues = (): (PropertyValue | null)[] => {
			let value = [
				(this.processStringValue() ||
					this.isLabelRefValue() ||
					this.processNumericNodePathOrRefValue() ||
					this.processByteStringValue()) ??
					null,
			];

			if (!value) {
				this.issues.push(this.genIssue(Issues.VALUE, this.currentToken));
			}

			if (validToken(this.currentToken, LexerToken.COMMA)) {
				this.moveToNextToken;
				const next = getValues();
				if (next === null) {
					this.issues.push(this.genIssue(Issues.VALUE, this.currentToken));
				}
				value = [...value, ...next];
			}

			return value;
		};

		const values = getValues();

		this.mergeStack();
		const node = new PropertyValues(values, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.start ?? values.at(0)?.tokenIndexes?.start,
			end: values.at(-1)?.tokenIndexes?.end,
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

		if (!token.value.match(/["']$/)) {
			this.issues.push(
				this.genIssue(
					token.value.endsWith('"') ? Issues.DUOUBE_QUOTE : Issues.SINGLE_QUOTE,
					token
				)
			);
		}

		const propValue = new StringValue(token.value);
		propValue.tokenIndexes = { start: token, end: token };

		const endLabels = this.processOptionalLablelAssign() ?? [];

		const node = new PropertyValue(propValue, endLabels);
		node.tokenIndexes = { start: token, end: token };
		this.mergeStack();
		return node;
	}

	private processNumericNodePathOrRefValue(): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.LT_SYM)) {
			this.popStack();
			return;
		}

		const value =
			(this.processNumericValues() || this.processNodePathOrLabelRefValue()) ?? null;
		if (!value) {
			this.issues.push(
				this.genIssue([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH], firstToken)
			);
		}

		const endLabels1 = this.processOptionalLablelAssign() ?? [];

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this.issues.push(this.genIssue(Issues.GT_SYM, this.prevToken));
		} else {
			this.moveToNextToken;
		}

		const endLabels2 = this.processOptionalLablelAssign() ?? [];

		this.mergeStack();
		const node = new PropertyValue(value, [...endLabels1, ...endLabels2]);
		node.tokenIndexes = {
			start: firstToken,
			end: endLabels2.at(-1)?.tokenIndexes?.end ?? this.prevToken,
		};
		return node;
	}

	private processByteStringValue(): PropertyValue | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;
		const token = firstToken;
		if (!validToken(token, LexerToken.SQUARE_OPEN)) {
			this.popStack();
			return;
		}

		const numberValues = this.processNumericValues();

		if (!numberValues?.values.length) {
			this.issues.push(this.genIssue(Issues.BYTESTRING, token));
		}

		const endLabels1 = this.processOptionalLablelAssign() ?? [];

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this.issues.push(this.genIssue(Issues.SQUARE_CLOSE, token));
		} else {
			this.moveToNextToken;
		}

		numberValues?.values.forEach((value) => {
			if ((value.tokenIndexes?.start?.pos.len ?? 0) % 2 !== 0) {
				this.issues.push(this.genIssue(Issues.BYTESTRING_EVEN, token));
			}

			if (value.tokenIndexes?.start?.tokens.some((tok) => tok === LexerToken.HEX)) {
				this.issues.push(this.genIssue(Issues.BYTESTRING_HEX, token));
			}
		});

		const endLabels2 = this.processOptionalLablelAssign() ?? [];

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

		if (!validToken(this.currentToken, LexerToken.NUMBER)) {
			this.popStack();
			return;
		}

		let value = this.processHex() || this.processDec();
		let result: NumberValue[] = [];

		while (value) {
			result = [...result, value];

			value = this.processHex() || this.processDec();
		}

		if (result) {
			const nextValue = this.processHex() || this.processDec();
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

	private processHex(): NumberValue | undefined {
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
		const node = new NumberValue(Number.parseInt(token.value, 16), labels);
		node.tokenIndexes = { start: labels.at(0)?.tokenIndexes?.end ?? token, end: token };
		return node;
	}

	private processDec(): NumberValue | undefined {
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
		const node = new NumberValue(Number.parseInt(token.value, 10), labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? token,
			end: token,
		};
		return node;
	}

	private isLabelRef(): LabelRef | undefined {
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
			const node = new LabelRef(null);
			node.tokenIndexes = { start: firstToken, end: firstToken };
			return node;
		}

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		const node = new LabelRef(token.value);
		node.tokenIndexes = { start: firstToken, end: token };
		this.mergeStack();
		return node;
	}

	private isLabelRefValue(): PropertyValue | undefined {
		this.enqueToStack();

		const labelRef = this.isLabelRef();

		if (!labelRef) {
			this.popStack();
			return;
		}

		const endLabels = this.processOptionalLablelAssign();

		const node = new PropertyValue(labelRef, endLabels);
		node.tokenIndexes = {
			start: labelRef.tokenIndexes?.start,
			end: endLabels.at(-1)?.tokenIndexes?.end ?? labelRef.tokenIndexes?.end,
		};

		this.mergeStack();
		return node;
	}

	private processNodePathOrLabelRefValue(): LabelRefValue | NodePathValue | undefined {
		const labels = this.processOptionalLablelAssign();
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

		const labelRef = this.isLabelRef();
		if (labelRef === undefined) {
			this.issues.push(this.genIssue([Issues.LABEL_NAME, Issues.NODE_PATH]));

			const node = new LabelRefValue(null, labels);
			node.tokenIndexes = {
				start: labels.at(0)?.tokenIndexes?.end ?? firstToken,
				end: firstToken,
			};
			return node;
		}

		const node = new LabelRefValue(labelRef.ref, labels);
		node.tokenIndexes = {
			start: labels.at(0)?.tokenIndexes?.end ?? firstToken,
			end: labelRef.tokenIndexes?.end,
		};
		return node;
	}

	private processNodePath(first = true): NodePath | undefined {
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

		const nodePath = new NodePath();
		nodePath.tokenIndexes = {
			start: firstToken,
			end: nodeName?.tokenIndexes?.end ?? firstToken,
		};

		nodePath.pathParts.push(nodeName ?? null);

		const remaningPath = this.processNodePath(false);
		if (remaningPath) {
			nodePath.pathParts.push(...remaningPath.pathParts);
			nodePath.tokenIndexes.end = remaningPath.tokenIndexes?.end;
		}

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

		token = this.moveToNextToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			// migh be a node ref such as &nodeLabel
			this.popStack();
			return;
		}

		// now we must have a valid path
		// /soc/node/node2@223/....
		const nodePath = this.processNodePath();

		const lastToken = this.currentToken;
		if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, this.prevToken));
		} else {
			this.moveToNextToken;
		}

		const node = new NodePathRef(nodePath ?? null);
		node.tokenIndexes = {
			start: firstToken,
			end: lastToken ?? nodePath?.tokenIndexes?.end ?? this.prevToken,
		};
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

	private genIssue = (expectedToken: Issues | Issues[], token?: Token): Issue => ({
		issues: Array.isArray(expectedToken) ? expectedToken : [expectedToken],
		token: token ?? this.tokens.at(-1),
		priority: this.positionStack.length,
	});
}

const validToken = (token: Token | undefined, expected: LexerToken) =>
	token?.tokens.some((t) => t === expected);
