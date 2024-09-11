import { getTokenModifiers, getTokenTypes, toRange } from '../helpers';
import {
	BuildSemanticTokensPush,
	SemanticTokenModifiers,
	SemanticTokenType,
	TokenIndexes,
} from 'src/types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';

export class ASTBase {
	public tokenIndexes?: TokenIndexes;
	protected semanticTokenType?: SemanticTokenType;
	protected semanticTokenModifiers?: SemanticTokenModifiers;
	protected _children: ASTBase[] = [];
	public parentNode?: ASTBase;
	protected docSymbolsMeta?: { name: string; kind: SymbolKind };
	private _uri?: string;

	get uri(): string | undefined {
		return this._uri ?? this.parentNode?.uri;
	}

	set uri(uri: string | undefined) {
		this._uri = uri;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		if (!this.docSymbolsMeta)
			return this.children.flatMap((child) => child.getDocumentSymbols() ?? []);

		return [
			{
				name: this.docSymbolsMeta.name,
				kind: this.docSymbolsMeta.kind,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [...this.children.flatMap((child) => child.getDocumentSymbols() ?? [])],
			},
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush) {
		this._children.forEach((child) => child.buildSemanticTokens(push));

		if (!this.semanticTokenType || !this.semanticTokenModifiers) {
			return;
		}

		push(
			getTokenTypes(this.semanticTokenType),
			getTokenModifiers(this.semanticTokenModifiers),
			this.tokenIndexes
		);
	}

	get children() {
		return this._children;
	}

	get allDescendants(): ASTBase[] {
		return [...this._children, ...this._children.flatMap((child) => child.allDescendants)];
	}

	protected addChild(child: ASTBase | null) {
		if (child) {
			child.parentNode = this;
			child.uri = this.uri;
			this.children.push(child);
		}
	}
}
