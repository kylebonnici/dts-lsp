import { getTokenModifiers, getTokenTypes, toRange } from '../helpers';
import type {
	BuildSemanticTokensPush,
	SemanticTokenModifiers,
	SemanticTokenType,
	Token,
	TokenIndexes,
} from '../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';

export class ASTBase {
	protected semanticTokenType?: SemanticTokenType;
	protected semanticTokenModifiers?: SemanticTokenModifiers;
	protected _children: ASTBase[] = [];
	public parentNode?: ASTBase;
	protected docSymbolsMeta?: { name: string; kind: SymbolKind };
	private _uri?: string;

	lastToken?: Token;
	fisrtToken?: Token;

	constructor(_tokenIndexes?: TokenIndexes) {
		this.fisrtToken = _tokenIndexes?.start;
		this.lastToken = _tokenIndexes?.end;
	}

	get uri(): string | undefined {
		return this._uri ?? this.parentNode?.uri;
	}

	set uri(uri: string | undefined) {
		this._uri = uri;
	}

	get tokenIndexes(): TokenIndexes {
		return {
			start: this.fisrtToken ?? this._children[0].tokenIndexes.start,
			end:
				this.lastToken ??
				this._children.at(-1)?.tokenIndexes.end ??
				this.fisrtToken ??
				this._children[0].tokenIndexes.start,
		};
	}

	getDocumentSymbols(): DocumentSymbol[] {
		if (!this.docSymbolsMeta)
			return this.children.flatMap((child) => child.getDocumentSymbols() ?? []);

		const range = toRange(this);
		return [
			{
				name: this.docSymbolsMeta.name,
				kind: this.docSymbolsMeta.kind,
				range,
				selectionRange: range,
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
