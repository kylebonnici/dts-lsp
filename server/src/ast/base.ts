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
