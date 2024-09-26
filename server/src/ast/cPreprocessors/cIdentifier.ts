import { SymbolKind } from 'vscode-languageserver';
import { Expression } from './expression';
import { TokenIndexes } from 'src/types';

export class CIdentifier extends Expression {
	constructor(public readonly name: string, tokenIndexes: TokenIndexes) {
		super(tokenIndexes);
		this.docSymbolsMeta = {
			name: this.name.toString(),
			kind: SymbolKind.Variable,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	evaluate(): string {
		throw new Error('Not Implimented');
	}

	toString() {
		return this.name;
	}
}
