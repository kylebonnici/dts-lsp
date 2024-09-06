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
	slxElement: SlxBase;
	priority: number;
}

export interface TokenIndexes {
	start?: Token;
	end?: Token;
}

export class SlxBase {
	public tokenIndexes?: TokenIndexes;
	public parent?: BaseNode;
}

export class BaseNode extends SlxBase {
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
	public nameOrRef: NodeName | LabelRef | null = null;

	constructor(public readonly labels: LabelNode[] = []) {
		super();
	}
}

export class DtcProperty extends SlxBase {
	public values: PropertyValues | null = null;

	constructor(
		public readonly propertyName: PropertyName | null,
		public readonly labels: LabelNode[] = []
	) {
		super();
	}
}

export class DeleteNode extends SlxBase {
	public nodeNameOrRef: NodeName | LabelRef | null = null;
}

export class PropertyName extends SlxBase {
	constructor(public readonly name: string) {
		super();
	}
}

export class DeleteProperty extends SlxBase {
	public propertyName: PropertyName | null = null;
}

export class LabelNode extends SlxBase {
	constructor(public readonly label: string) {
		super();
	}
}

export class NodeName extends SlxBase {
	constructor(public readonly name: string, public readonly address?: number) {
		super();
	}
}

export class NodePath extends SlxBase {
	pathParts: (NodeName | null)[] = [];

	constructor() {
		super();
	}
}

export class LabelRef extends SlxBase {
	constructor(public readonly ref: string | null) {
		super();
	}
}

export class StringValue extends SlxBase {
	constructor(public readonly value: string) {
		super();
	}
}

export class ByteStringValue extends SlxBase {
	constructor(public readonly values: (NumberValue | null)[]) {
		super();
	}
}

export class LabelRefValue extends SlxBase {
	constructor(public readonly value: string | null, public readonly labels: LabelNode[]) {
		super();
	}
}

export class NodePathValue extends SlxBase {
	constructor(
		public readonly path: NodePathRef | null,
		public readonly labels: LabelNode[]
	) {
		super();
	}
}

export class NodePathRef extends SlxBase {
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
export class PropertyValues extends SlxBase {
	constructor(
		public readonly values: (PropertyValue | null)[],
		public readonly labels: LabelNode[]
	) {
		super();
	}
}

export class PropertyValue extends SlxBase {
	constructor(public readonly value: AllValueType, public readonly endLabels: LabelNode[]) {
		super();
	}
}

export class NumberValues extends SlxBase {
	constructor(public readonly values: NumberValue[]) {
		super();
	}
}

export class NumberValue extends SlxBase {
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
				const node = new SlxBase();
				const token = this.moveToNextToken;
				node.tokenIndexes = { start: token, end: token };
				this.issues.push(this.genIssue(Issues.UNKNOWN, node));
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

		const lastToken = this.nodeEnd(child) ?? nextToken;
		child.tokenIndexes = { start: firstToken, end: lastToken };
		this.mergeStack();
		return true;
	}

	private nodeEnd(slxBase: SlxBase) {
		const nextToken = this.currentToken;
		const expectedToken = LexerToken.CURLY_CLOSE;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, slxBase));
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

	private endStatment(slxBase: SlxBase) {
		const nextToken = this.currentToken;
		const expectedToken = LexerToken.SEMICOLON;
		if (!validToken(nextToken, expectedToken)) {
			this.issues.push(this.genIssue(Issues.END_STATMENT, slxBase));
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
				const node = new SlxBase();
				const token = this.moveToNextToken;
				node.tokenIndexes = { start: token, end: token };
				this.issues.push(this.genIssue(Issues.UNKNOWN, node));
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

	private processNodeName(slxBase: SlxBase): NodeName | undefined {
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
			this.issues.push(this.genIssue(Issues.NODE_ADDRESS, slxBase));
		}

		return node;
	}

	private isChildNode(parentNode: BaseNode, allow: AllowNodeDef): boolean {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		let nameOrRef: NodeName | LabelRef | undefined;

		const child: DtcChilNode = new DtcChilNode(labels);
		if (allow === 'Both' || allow === 'Ref') {
			nameOrRef = this.isLabelRef();
		}

		if ((!nameOrRef && allow === 'Both') || allow === 'Name') {
			nameOrRef = this.processNodeName(child);

			if (!nameOrRef) {
				if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
					// must be property then ....
					this.popStack();
					return false;
				}

				this.issues.push(this.genIssue([Issues.NODE_NAME, Issues.NODE_REF], child));
			}
		}

		child.nameOrRef = nameOrRef ?? null;
		const expectedNode = nameOrRef && !(typeof nameOrRef === 'string');

		const token = this.moveToNextToken;
		if (!validToken(token, LexerToken.CURLY_OPEN)) {
			if (expectedNode) {
				this.issues.push(this.genIssue(Issues.CURLY_OPEN, child));
			} else {
				// this could be a property
				this.popStack();
				return false;
			}
		}

		// syntax must be a node ....

		parentNode.nodes.push(child);

		let hasChild: boolean = false;
		do {
			hasChild = this.processNode(child, 'Name');
		} while (hasChild);

		const lastToken = this.nodeEnd(child);

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
					this.genIssue([Issues.PROPERTY_DEFINITION, Issues.NODE_DEFINITION], parent)
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
				this.issues.push(this.genIssue(Issues.VALUE, child));
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

		const node = new DeleteNode();

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, node));
		} else {
			token = this.moveToNextToken;
		}

		const labelRef = this.isLabelRef();
		const nodeName = labelRef ? undefined : this.processNodeName(node);

		if (!nodeName && !labelRef) {
			this.issues.push(this.genIssue([Issues.NODE_NAME, Issues.NODE_REF], node));
		}

		node.nodeNameOrRef = labelRef ?? nodeName ?? null;

		const lastToken = this.endStatment(node);
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

		const node = new DeleteProperty();

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, node));
		} else {
			token = this.moveToNextToken;
		}

		if (!validToken(this.currentToken, LexerToken.PROPERTY_NAME)) {
			this.issues.push(this.genIssue(Issues.PROPERTY_NAME, node));
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
		parent.deleteProperties.push(node);

		this.mergeStack();
		return true;
	}

	private processValue(dtcProperty: DtcProperty): PropertyValues {
		this.enqueToStack();

		const labels = this.processOptionalLablelAssign();

		const getValues = (): (PropertyValue | null)[] => {
			let value = [
				(this.processStringValue() ||
					this.isLabelRefValue(dtcProperty) ||
					this.processNumericNodePathOrRefValue(dtcProperty) ||
					this.processByteStringValue(dtcProperty)) ??
					null,
			];

			if (!value) {
				this.issues.push(this.genIssue(Issues.VALUE, dtcProperty));
			}

			if (validToken(this.currentToken, LexerToken.COMMA)) {
				this.moveToNextToken;
				const next = getValues();
				if (next === null) {
					this.issues.push(this.genIssue(Issues.VALUE, dtcProperty));
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

		const propValue = new StringValue(token.value);

		if (!token.value.match(/["']$/)) {
			this.issues.push(
				this.genIssue(
					token.value.endsWith('"') ? Issues.DUOUBE_QUOTE : Issues.SINGLE_QUOTE,
					propValue
				)
			);
		}

		propValue.tokenIndexes = { start: token, end: token };

		const endLabels = this.processOptionalLablelAssign() ?? [];

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
					[Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH],
					dtcProperty
				)
			);
		}

		const endLabels1 = this.processOptionalLablelAssign() ?? [];

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this.issues.push(this.genIssue(Issues.GT_SYM, dtcProperty));
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
			this.issues.push(this.genIssue(Issues.BYTESTRING, dtcProperty));
		}

		const endLabels1 = this.processOptionalLablelAssign() ?? [];

		if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
			this.issues.push(this.genIssue(Issues.SQUARE_CLOSE, dtcProperty));
		} else {
			this.moveToNextToken;
		}

		numberValues?.values.forEach((value) => {
			if ((value.tokenIndexes?.start?.pos.len ?? 0) % 2 !== 0) {
				this.issues.push(this.genIssue(Issues.BYTESTRING_EVEN, value));
			}

			if (value.tokenIndexes?.start?.tokens.some((tok) => tok === LexerToken.HEX)) {
				this.issues.push(this.genIssue(Issues.BYTESTRING_HEX, value));
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

	private isLabelRef(slxBase?: SlxBase): LabelRef | undefined {
		this.enqueToStack();
		const firstToken = this.moveToNextToken;
		let token = firstToken;
		if (!validToken(token, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		token = this.moveToNextToken;
		if (!validToken(token, LexerToken.LABEL_NAME)) {
			const node = new LabelRef(null);
			this.issues.push(this.genIssue(Issues.LABEL_NAME, slxBase ?? node));
			node.tokenIndexes = { start: firstToken, end: firstToken };

			this.mergeStack();
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

	private isLabelRefValue(dtcProperty: DtcProperty): PropertyValue | undefined {
		this.enqueToStack();

		const labelRef = this.isLabelRef(dtcProperty);

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

	private processNodePathOrLabelRefValue(
		dtcProperty: DtcProperty
	): LabelRefValue | NodePathValue | undefined {
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

		const labelRef = this.isLabelRef(dtcProperty);
		if (labelRef === undefined) {
			this.issues.push(this.genIssue([Issues.LABEL_NAME, Issues.NODE_PATH], dtcProperty));

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

	private processNodePath(first = true, nodePath = new NodePath()): NodePath | undefined {
		this.enqueToStack();

		const firstToken = this.moveToNextToken;

		if (!validToken(firstToken, LexerToken.FORWARD_SLASH)) {
			if (!first) {
				this.popStack();
				return;
			}
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_START_PATH, nodePath));
		}

		const nodeName = this.processNodeName(nodePath);
		if (!nodeName) {
			this.issues.push(this.genIssue(Issues.NODE_NAME, nodePath));
		}

		nodePath.tokenIndexes = {
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

		token = this.moveToNextToken;
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
		if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
			this.issues.push(this.genIssue(Issues.CURLY_CLOSE, node));
		} else {
			this.moveToNextToken;
		}

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

	private genIssue = (expectedToken: Issues | Issues[], slxBase: SlxBase): Issue => ({
		issues: Array.isArray(expectedToken) ? expectedToken : [expectedToken],
		slxElement: slxBase,
		priority: this.positionStack.length,
	});
}

const validToken = (token: Token | undefined, expected: LexerToken) =>
	token?.tokens.some((t) => t === expected);
