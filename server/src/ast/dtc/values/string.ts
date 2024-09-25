import { ASTBase } from '../../base';
import { SymbolKind } from 'vscode-languageserver';
import { TokenIndexes } from 'src/types';

export class StringValue extends ASTBase {
	constructor(public readonly value: string, tokenIndexes: TokenIndexes) {
		super(tokenIndexes);
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
		this.docSymbolsMeta = {
			name: this.value,
			kind: SymbolKind.String,
		};
	}

	toString() {
		return this.value.toString();
	}
}
