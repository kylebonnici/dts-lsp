import { BuildSemanticTokensPush, Token } from '../../types';
import { ASTBase } from '../base';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { getTokenModifiers, getTokenTypes, toRange } from '../../helpers';
import { DtcProperty } from './property';
import { DeleteNode } from './deleteNode';
import { Keyword } from '../keyword';
import { Label } from './label';
import { DeleteProperty } from './deleteProperty';
import { LabelRef } from './labelRef';

export class BaseNode extends ASTBase {
	protected _children: ASTBase[] = [];

	constructor(protected readonly parentNode: BaseNode | null) {
		super();
	}

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

	get children() {
		return this._children;
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcNode);
	}

	get deleteNodes() {
		return this.children.filter((child) => child instanceof DeleteNode);
	}

	public addChild(child: DtcNode | DeleteNode) {
		this.children.push(child);
	}
}

export class DtcNode extends BaseNode {
	private _keyword: ASTBase | undefined;

	constructor(parentNode: BaseNode | null) {
		super(parentNode);
	}

	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	public addChild(child: DtcNode | DeleteNode | DtcProperty | DeleteProperty) {
		this.children.push(child);
	}

	private get keyword() {
		if (!this.tokenIndexes?.start) return;
		this._keyword ??= new Keyword();
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

export class DtcRefNode extends DtcNode {
	public ref: LabelRef | null = null;

	constructor(parentNode: BaseNode | null, public readonly labels: Label[] = []) {
		super(parentNode);
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.ref?.value ?? 'DTC Name',
				kind: SymbolKind.Namespace,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.ref?.getDocumentSymbols() ?? []),
					...this.nodes.flatMap((node) => node.getDocumentSymbols()),
					...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
					...this.properties.flatMap((property) => property.getDocumentSymbols()),
					...this.deleteProperties.flatMap((property) => property.getDocumentSymbols()),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.ref?.buildSemanticTokens(builder);
		this.nodes.forEach((node) => node.buildSemanticTokens(builder));
		this.deleteNodes.forEach((node) => node.buildSemanticTokens(builder));
		this.properties.forEach((property) => property.buildSemanticTokens(builder));
		this.deleteProperties.forEach((property) => property.buildSemanticTokens(builder));
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
	}
}

export class DtcChildNode extends DtcNode {
	public name: NodeName | null = null;

	constructor(parentNode: BaseNode | null, public readonly labels: Label[] = []) {
		super(parentNode);
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.name?.value ?? 'DTC Name',
				kind: SymbolKind.Namespace,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.name?.getDocumentSymbols() ?? []),
					...this.nodes.flatMap((node) => node.getDocumentSymbols()),
					...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
					...this.properties.flatMap((property) => property.getDocumentSymbols()),
					...this.deleteProperties.flatMap((property) => property.getDocumentSymbols()),
				],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.name?.buildSemanticTokens(builder);
		this.nodes.forEach((node) => node.buildSemanticTokens(builder));
		this.deleteNodes.forEach((node) => node.buildSemanticTokens(builder));
		this.properties.forEach((property) => property.buildSemanticTokens(builder));
		this.deleteProperties.forEach((property) => property.buildSemanticTokens(builder));
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
	}
}

export class NodeName extends ASTBase {
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
