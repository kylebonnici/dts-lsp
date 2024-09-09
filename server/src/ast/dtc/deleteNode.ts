import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { NodeName } from './node';
import { LabelRef } from './labelRef';

export class DeleteNode extends ASTBase {
	private _nodeNameOrRef: NodeName | LabelRef | null = null;

	constructor(private keyword: Keyword) {
		super();
		this.addChild(keyword);
	}

	set nodeNameOrRef(nodeNameOrRef: NodeName | LabelRef | null) {
		if (this._nodeNameOrRef) throw new Error('Only on property name is allowed');
		this._nodeNameOrRef = nodeNameOrRef;
		this.addChild(nodeNameOrRef);
	}

	get nodeNameOrRef() {
		return this._nodeNameOrRef;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Delete Node',
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [...(this._nodeNameOrRef?.getDocumentSymbols() ?? [])],
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this._nodeNameOrRef?.buildSemanticTokens(builder);
		this.keyword.buildSemanticTokens(builder);
	}
}
