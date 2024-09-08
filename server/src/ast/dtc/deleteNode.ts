import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { NodeName } from './node';
import { LabelRef } from './labelRef';

export class DeleteNode extends ASTBase {
	public nodeNameOrRef: NodeName | LabelRef | null = null;

	constructor(private keyWord: Keyword) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Delete Node',
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [...(this.nodeNameOrRef?.getDocumentSymbols() ?? [])],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.nodeNameOrRef?.buildSemanticTokens(builder);
		this.keyWord.buildSemanticTokens(builder);
	}
}
