import { DocumentSymbol, SemanticTokensBuilder, SymbolKind } from 'vscode-languageserver';
import { LexerToken, Token } from './lexer';

export const tokenTypes = [
	'namespace',
	'class',
	'enum',
	'interface',
	'struct',
	'typeParameter',
	'type',
	'parameter',
	'variable',
	'property',
	'enumMember',
	'decorator',
	'event',
	'function',
	'method',
	'macro',
	'label',
	'comment',
	'string',
	'keyword',
	'number',
	'regexp',
	'operator',
] as const;

type SemanticTokenType = (typeof tokenTypes)[number];

const getTokenTypes = (type: SemanticTokenType) => {
	return tokenTypes.findIndex((t) => t === type);
};

export const tokenModifiers = [
	'declaration',
	'definition',
	'readonly',
	'static',
	'deprecated',
	'abstract',
	'async',
	'modification',
	'documentation',
	'defaultLibrary',
] as const;

type SemanticTokenModifiers = (typeof tokenModifiers)[number];

const getTokenModifiers = (type: SemanticTokenModifiers) => {
	return tokenModifiers.findIndex((t) => t === type);
};

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
	NO_STAMENTE,
	LABEL_ASSIGN_MISSING_COLON,
	DELETE_INCOMPLETE,
}

type AllowNodeRef = 'Both' | 'Ref' | 'Name';

export interface Issue {
	issues: Issues[];
	slxElement: SlxBase;
	priority: number;
}

export interface TokenIndexes {
	start?: Token;
	end?: Token;
}

type BuildSemanticTokensPush = (
	tokenType: number,
	tokenModifiers: number,
	tokenIndexes?: TokenIndexes
) => void;

export class SlxBase {
	public tokenIndexes?: TokenIndexes;
	protected semanticTokenType?: SemanticTokenType;
	protected semanticTokenModifiers?: SemanticTokenModifiers;

	getDocumentSymbols(): DocumentSymbol[] {
		return [];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush) {
		if (!this.semanticTokenType || !this.semanticTokenModifiers) {
			return;
		}

		push(
			getTokenTypes(this.semanticTokenType),
			getTokenModifiers(this.semanticTokenModifiers),
			this.tokenIndexes
		);
	}
}

export class BaseNode extends SlxBase {
	public nodes: DtcNode[] = [];
	public deleteNodes: DeleteNode[] = [];

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...this.nodes.flatMap((node) => node.getDocumentSymbols()),
			...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush) {
		this.nodes.forEach((node) => node.buildSemanticTokens(push));
		this.deleteNodes.forEach((node) => node.buildSemanticTokens(push));
	}
}

export class DtcNode extends BaseNode {
	public properties: DtcProperty[] = [];
	public deleteProperties: DeleteProperty[] = [];
	private _keyword: SlxBase | undefined;

	constructor() {
		super();
	}

	private get keyword() {
		if (!this.tokenIndexes?.start) return;
		this._keyword ??= new KeyWord();
		const newTokenIndex: Token = {
			...this.tokenIndexes?.start,
			pos: {
				col: this.tokenIndexes.start.pos.col ?? 0,
				len: 1,
				line: this.tokenIndexes?.start.pos.line ?? 0,
			},
		};
		this._keyword.tokenIndexes = {
			start: newTokenIndex,
			end: newTokenIndex,
		};
		return this._keyword;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: '/',
				kind: SymbolKind.Class,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...this.nodes.flatMap((node) => node.getDocumentSymbols()),
					...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
					...this.properties.flatMap((property) => property.getDocumentSymbols()),
					...this.deleteProperties.flatMap((property) => property.getDocumentSymbols()),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.keyword?.buildSemanticTokens(builder);
		this.nodes.forEach((node) => node.buildSemanticTokens(builder));
		this.deleteNodes.forEach((node) => node.buildSemanticTokens(builder));
		this.properties.forEach((property) => property.buildSemanticTokens(builder));
		this.deleteProperties.forEach((property) => property.buildSemanticTokens(builder));
	}
}
export class DtcChilNode extends DtcNode {
	public nameOrRef: NodeName | LabelRef | null = null;

	constructor(public readonly labels: LabelNode[] = []) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.nameOrRef?.value ?? 'DTC Name',
				kind: SymbolKind.Namespace,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.nameOrRef?.getDocumentSymbols() ?? []),
					...this.nodes.flatMap((node) => node.getDocumentSymbols()),
					...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
					...this.properties.flatMap((property) => property.getDocumentSymbols()),
					...this.deleteProperties.flatMap((property) => property.getDocumentSymbols()),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.nameOrRef?.buildSemanticTokens(builder);
		this.nodes.forEach((node) => node.buildSemanticTokens(builder));
		this.deleteNodes.forEach((node) => node.buildSemanticTokens(builder));
		this.properties.forEach((property) => property.buildSemanticTokens(builder));
		this.deleteProperties.forEach((property) => property.buildSemanticTokens(builder));
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
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

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.propertyName?.name ?? 'Unknown',
				kind: SymbolKind.Property,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [...(this.values?.getDocumentSymbols() ?? [])],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.propertyName?.buildSemanticTokens(builder);
		this.values?.buildSemanticTokens(builder);
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
	}
}

export class KeyWord extends SlxBase {
	constructor() {
		super();
		this.semanticTokenType = 'keyword';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class DeleteNode extends SlxBase {
	public nodeNameOrRef: NodeName | LabelRef | null = null;

	constructor(private keyWord: KeyWord) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Delete Node',
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [...(this.nodeNameOrRef?.getDocumentSymbols() ?? [])],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.nodeNameOrRef?.buildSemanticTokens(builder);
		this.keyWord.buildSemanticTokens(builder);
	}
}

export class PropertyName extends SlxBase {
	constructor(public readonly name: string) {
		super();
		this.semanticTokenType = 'property';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.name,
				kind: SymbolKind.Property,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export class DeleteProperty extends SlxBase {
	public propertyName: PropertyName | null = null;

	constructor(private keyWord: KeyWord) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Delete Property',
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.propertyName?.getDocumentSymbols(),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.propertyName?.buildSemanticTokens(builder);
		this.keyWord.buildSemanticTokens(builder);
	}
}

export class LabelNode extends SlxBase {
	constructor(public readonly label: string) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.label,
				kind: SymbolKind.Module,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export const toRange = (slxBase: SlxBase) => {
	return {
		start: {
			line: slxBase.tokenIndexes?.start?.pos.line ?? 0,
			character: slxBase.tokenIndexes?.start?.pos.col ?? 0,
		},
		end: {
			line: slxBase.tokenIndexes?.end?.pos.line ?? 0,
			character:
				(slxBase.tokenIndexes?.end?.pos.col ?? 0) +
				(slxBase.tokenIndexes?.end?.pos.len ?? 0),
		},
	};
};

export class NodeName extends SlxBase {
	constructor(public readonly name: string, public readonly address?: number) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	get value() {
		return this.name;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.address ? `${this.name}@${this.address}` : this.name,
				kind: SymbolKind.Class,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		if (!this.tokenIndexes?.start || !this.tokenIndexes.start.value) return;

		const nameNewStart = {
			...this.tokenIndexes.start,
			pos: {
				...this.tokenIndexes.start.pos,
				len: this.name.length,
			},
		};
		push(getTokenTypes('type'), getTokenModifiers('declaration'), {
			start: nameNewStart,
			end: nameNewStart,
		});
		if (this.address) {
			const addressNewStart = {
				...this.tokenIndexes.start,
				pos: {
					line: this.tokenIndexes.start.pos.line,
					col: this.tokenIndexes.start.pos.col + this.name.length + 1,
					len: this.tokenIndexes.start.pos.len - this.name.length - 1,
				},
			};

			const atSymbolNewStart = {
				...this.tokenIndexes.start,
				pos: {
					line: this.tokenIndexes.start.pos.line,
					col: this.name.length + 2,
					len: 1,
				},
			};

			push(getTokenTypes('decorator'), getTokenModifiers('declaration'), {
				start: atSymbolNewStart,
				end: atSymbolNewStart,
			});

			push(getTokenTypes('number'), getTokenModifiers('declaration'), {
				start: addressNewStart,
				end: addressNewStart,
			});
		}
	}
}

export class NodePath extends SlxBase {
	pathParts: (NodeName | null)[] = [];

	constructor() {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.pathParts.join('/'),
				kind: SymbolKind.Key,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export class LabelRef extends SlxBase {
	constructor(public readonly ref: LabelNode | null) {
		super();
	}

	get value() {
		return this.ref?.label;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: `&${this.ref?.label ?? 'NULL'}`,
				kind: SymbolKind.Key,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		this.ref?.buildSemanticTokens(push);
	}
}

export class StringValue extends SlxBase {
	constructor(public readonly value: string) {
		super();
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.value,
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export class ByteStringValue extends SlxBase {
	constructor(public readonly values: (NumberWithLabelValue | null)[]) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Byte String Value',
				kind: SymbolKind.Array,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.values.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.values.forEach((v) => v?.buildSemanticTokens(builder));
	}
}

export class LabelRefValue extends SlxBase {
	constructor(
		public readonly value: LabelNode | null,
		public readonly labels: LabelNode[]
	) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.value?.label ?? 'NULL',
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.value?.buildSemanticTokens(builder);
	}
}

export class NodePathValue extends SlxBase {
	constructor(
		public readonly path: NodePathRef | null,
		public readonly labels: LabelNode[]
	) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Node Path',
				kind: SymbolKind.Variable,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.path?.getDocumentSymbols(),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.path?.buildSemanticTokens(builder);
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
	}
}

export class NodePathRef extends SlxBase {
	constructor(public readonly path: NodePath | null) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Node Path Referance',
				kind: SymbolKind.Variable,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.path?.getDocumentSymbols(),
			},
		];
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

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Property Values',
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...this.labels.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
					...this.values.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.values.forEach((v) => v?.buildSemanticTokens(builder));
		this.labels.forEach((v) => v?.buildSemanticTokens(builder));
	}
}

export class PropertyValue extends SlxBase {
	constructor(public readonly value: AllValueType, public readonly endLabels: LabelNode[]) {
		super();
	}
	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Property Value',
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.value?.getDocumentSymbols() ?? []),
					...this.endLabels.flatMap((label) => label.getDocumentSymbols() ?? []),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.value?.buildSemanticTokens(builder);
		this.endLabels.forEach((label) => label?.buildSemanticTokens(builder));
	}
}

export class NumberValues extends SlxBase {
	constructor(public readonly values: NumberWithLabelValue[]) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Cell Array',
				kind: SymbolKind.Array,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.values.flatMap((v) => v.getDocumentSymbols()),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		return this.values.forEach((v) => v.buildSemanticTokens(builder));
	}
}

export class NumberValue extends SlxBase {
	constructor(public readonly value: number) {
		super();
		this.semanticTokenType = 'number';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class NumberWithLabelValue extends SlxBase {
	constructor(public readonly number: NumberValue, public readonly labels: LabelNode[]) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...this.number.getDocumentSymbols(),
			...this.labels.flatMap((label) => label.getDocumentSymbols()),
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		this.number.buildSemanticTokens(push);
		this.labels.forEach((label) => label.buildSemanticTokens(push));
	}
}

export class Parser {
	rootDocument = new BaseNode();
	positionStack: number[] = [];
	issues: Issue[] = [];
	unhandledStaments = new DtcNode();

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
					this.isDeleteNode(this.rootDocument) ||
					// not valid syntax but we leave this for the next layer to proecess
					this.isProperty(this.unhandledStaments) ||
					this.isDeleteProperty(this.unhandledStaments) ||
					// Valid use case
					this.isChildNode(this.rootDocument, 'Both')
				)
			) {
				const node = new SlxBase();
				const token = this.moveToNextToken;
				node.tokenIndexes = { start: token, end: token };
				this.issues.push(this.genIssue(Issues.UNKNOWN, node));
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
		const currentToken = this.currentToken;
		if (!validToken(currentToken, LexerToken.SEMICOLON)) {
			this.issues.push(this.genIssue(Issues.END_STATMENT, slxBase));
			return this.prevToken;
		}

		this.moveToNextToken;

		this.reportExtraEndStaments();

		return currentToken;
	}

	private reportExtraEndStaments() {
		while (validToken(this.currentToken, LexerToken.SEMICOLON)) {
			const token = this.moveToNextToken;
			const node = new SlxBase();
			node.tokenIndexes = { start: token, end: token };
			this.issues.push(this.genIssue(Issues.NO_STAMENTE, node));
		}
	}

	private processNode(parent: DtcNode, allow: AllowNodeRef): boolean {
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

	private processOptionalLablelAssign(acceptLabelName = false): LabelNode[] {
		const labels: LabelNode[] = [];

		// Find all labels before node/property/value.....
		let token = this.currentToken;
		while (
			validToken(token, LexerToken.LABEL_ASSIGN) ||
			(acceptLabelName && validToken(token, LexerToken.LABEL_NAME))
		) {
			if (token?.value) {
				const node = new LabelNode(token.value);
				node.tokenIndexes = { start: token, end: token };
				labels.push(node);

				if (validToken(token, LexerToken.LABEL_NAME)) {
					this.issues.push(this.genIssue(Issues.LABEL_ASSIGN_MISSING_COLON, node));
				}
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

	private isChildNode(parentNode: BaseNode, allow: AllowNodeRef): boolean {
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
			if (labels.length && !validToken(token, LexerToken.NODE_NAME)) {
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

	private isDeleteNode(parent: BaseNode): boolean {
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

		const keyword = new KeyWord();

		if (token?.value !== 'delete-node') {
			this.issues.push(this.genIssue(Issues.DELETE_INCOMPLETE, keyword));
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, keyword));
		} else {
			token = this.moveToNextToken;
		}
		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteNode(keyword);

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
		if (token?.value && !'delete-property'.startsWith(token.value)) {
			this.popStack();
			return false;
		}

		const keyword = new KeyWord();

		if (token?.value !== 'delete-property') {
			this.issues.push(this.genIssue(Issues.DELETE_INCOMPLETE, keyword));
		}

		if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
			this.issues.push(this.genIssue(Issues.FORWARD_SLASH_END_DELETE, keyword));
		} else {
			token = this.moveToNextToken;
		}

		keyword.tokenIndexes = { start: firstToken, end: token };

		const node = new DeleteProperty(keyword);

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
				this.issues.push(this.genIssue(Issues.VALUE, dtcProperty));
			}

			while (validToken(this.currentToken, LexerToken.COMMA)) {
				const start = this.prevToken;
				const end = this.currentToken;
				this.moveToNextToken;
				const next = getValue();
				if (next === null) {
					const node = new SlxBase();
					node.tokenIndexes = { start, end };
					this.issues.push(this.genIssue(Issues.VALUE, node));
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
					token.value.startsWith('"') ? Issues.DUOUBE_QUOTE : Issues.SINGLE_QUOTE,
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
					[Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH],
					dtcProperty
				)
			);
		}

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

		if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
			this.issues.push(this.genIssue(Issues.GT_SYM, dtcProperty));
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
			this.issues.push(this.genIssue(Issues.BYTESTRING, dtcProperty));
		}

		const endLabels1 = this.processOptionalLablelAssign(true) ?? [];

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

	private isLabelRef(slxBase?: SlxBase): LabelRef | undefined {
		this.enqueToStack();
		const firstToken = this.moveToNextToken;
		if (!validToken(firstToken, LexerToken.AMPERSAND)) {
			this.popStack();
			return;
		}

		if (!validToken(this.currentToken, LexerToken.LABEL_NAME)) {
			const node = new LabelRef(null);
			this.issues.push(this.genIssue(Issues.LABEL_NAME, slxBase ?? node));
			node.tokenIndexes = { start: firstToken, end: firstToken };

			this.mergeStack();
			return node;
		}

		const token = this.moveToNextToken;

		if (token?.value === undefined) {
			throw new Error('Token must have value');
		}

		const labelName = new LabelNode(token.value);
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
