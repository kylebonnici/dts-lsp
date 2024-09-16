import { ASTBase } from '../base';
import { SymbolKind } from 'vscode-languageserver';
import { Expression } from './expression';

export class CIdentifier extends Expression {
	constructor(public readonly value: string) {
		super();
		this.docSymbolsMeta = {
			name: this.value.toString(),
			kind: SymbolKind.Variable,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	evaluate(): string {
		throw new Error('Not Implimented');
	}
}
