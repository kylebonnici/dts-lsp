import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { toRange } from '../../helpers';

export class Label extends ASTBase {
	constructor(public readonly label: string) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.label,
				kind: SymbolKind.Module,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}
