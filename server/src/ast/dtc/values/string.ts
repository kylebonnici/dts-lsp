import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';

export class StringValue extends ASTBase {
	constructor(public readonly value: string) {
		super();
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
		this.docSymbolsMeta = {
			name: this.value,
			kind: SymbolKind.String,
		};
	}
}
