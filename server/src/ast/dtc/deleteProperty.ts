import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { PropertyName } from './property';

export class DeleteProperty extends ASTBase {
	public propertyName: PropertyName | null = null;

	constructor(private keyWord: Keyword) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Delete Property',
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.propertyName?.getDocumentSymbols(),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.propertyName?.buildSemanticTokens(builder);
		this.keyWord.buildSemanticTokens(builder);
	}
}
