import { getTokenModifiers, getTokenTypes } from '../helpers';
import {
	BuildSemanticTokensPush,
	SemanticTokenModifiers,
	SemanticTokenType,
	TokenIndexes,
} from 'src/types';
import { DocumentSymbol } from 'vscode-languageserver';

export class ASTBase {
	public tokenIndexes?: TokenIndexes;
	protected semanticTokenType?: SemanticTokenType;
	protected semanticTokenModifiers?: SemanticTokenModifiers;
	protected _children: ASTBase[] = [];
	public parentNode?: ASTBase;

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

	get children() {
		return this._children;
	}
	protected addChild(child: ASTBase | null) {
		if (child) {
			child.parentNode = this;
			this.children.push(child);
		}
	}
}
