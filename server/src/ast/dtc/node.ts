import { BuildSemanticTokensPush, Token } from '../../types';
import { ASTBase } from '../base';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { getTokenModifiers, getTokenTypes, toRange } from '../../helpers';
import { DtcProperty } from './property';
import { DeleteNode } from './deleteNode';
import { Keyword } from '../keyword';
import { LabelAssign } from './label';
import { DeleteProperty } from './deleteProperty';
import { LabelRef } from './labelRef';

export class DtcBaseNode extends ASTBase {
	constructor() {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...this.nodes.flatMap((node) => node.getDocumentSymbols()),
			...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
		];
	}

	get path(): string[] | undefined {
		if (!this.pathName) return undefined;
		if (!this.parentNode || this instanceof DtcRootNode) return [this.pathName];
		if (!(this.parentNode instanceof DtcBaseNode)) return undefined;
		const parentPath = this.parentNode.path;
		if (!parentPath) return undefined;

		return [...parentPath, this.pathName];
	}

	get pathName(): string | undefined {
		return undefined;
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcBaseNode);
	}

	get deleteNodes() {
		return this.children.filter((child) => child instanceof DeleteNode);
	}

	public addNodeChild(child: DtcBaseNode | DeleteNode | DtcProperty | DeleteProperty) {
		this.addChild(child);
	}
}

export class DtcRootNode extends DtcBaseNode {
	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcChildNode) as DtcChildNode[];
	}

	get pathName() {
		return '/';
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
}

export class DtcRefNode extends DtcBaseNode {
	public labelReferance: LabelRef | null = null;

	constructor(public readonly labels: LabelAssign[] = []) {
		super();
		labels.forEach((label) => {
			super.addChild(label);
		});
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcChildNode);
	}

	get pathName() {
		return `&${this.labelReferance?.label?.value}`;
	}

	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.labelReferance?.value ?? 'DTC Name',
				kind: SymbolKind.Namespace,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.labelReferance?.getDocumentSymbols() ?? []),
					...this.nodes.flatMap((node) => node.getDocumentSymbols()),
					...this.deleteNodes.flatMap((node) => node.getDocumentSymbols()),
					...this.properties.flatMap((property) => property.getDocumentSymbols()),
					...this.deleteProperties.flatMap((property) => property.getDocumentSymbols()),
				],
			},
		];
	}
}

export class DtcChildNode extends DtcBaseNode {
	public name: NodeName | null = null;

	constructor(public readonly labels: LabelAssign[] = []) {
		super();
		labels.forEach((label) => {
			this.addChild(label);
		});
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcChildNode) as DtcChildNode[];
	}

	get pathName() {
		return this.name?.toString();
	}
	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
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

	toString() {
		return this.address ? `${this.name}@${this.address}` : this.name;
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
