import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { NodeName } from './node';
import { LabelRef } from './labelRef';

export class DeleteBase extends ASTBase {
	constructor(name: string, keyword: Keyword) {
		super();
		this.addChild(keyword);
		this.docSymbolsMeta = {
			name,
			kind: SymbolKind.Function,
		};
	}
}
