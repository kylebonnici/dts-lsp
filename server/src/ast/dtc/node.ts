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
	private _keyword: ASTBase | undefined;

	constructor() {
		super();
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

export class DtcChilNode extends DtcNode {
	public nameOrRef: NodeName | LabelRef | null = null;

	constructor(public readonly labels: Label[] = []) {
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
