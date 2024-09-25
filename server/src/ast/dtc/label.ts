import { SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { TokenIndexes } from '../../types';

export class LabelAssign extends ASTBase {
	constructor(public readonly label: string, tokenIndex: TokenIndexes) {
		super(tokenIndex);
		this.docSymbolsMeta = {
			name: this.label,
			kind: SymbolKind.Module,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class Label extends ASTBase {
	constructor(public readonly value: string, tokenIndex: TokenIndexes) {
		super(tokenIndex);
		this.docSymbolsMeta = {
			name: this.value,
			kind: SymbolKind.Module,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
}
