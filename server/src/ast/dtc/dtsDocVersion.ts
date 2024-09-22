import { Token, TokenIndexes } from '../../types';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { SymbolKind } from 'vscode-languageserver';

export class DtsDocumentVersion extends ASTBase {
	lastToken?: Token;

	constructor(public readonly keyword: Keyword) {
		super();
		this.addChild(keyword);
		this.docSymbolsMeta = {
			name: 'DTS Douument version',
			kind: SymbolKind.Function,
		};
	}

	get tokenIndexes(): TokenIndexes {
		const tokenIndexes = super.tokenIndexes;
		return this.lastToken ? { ...tokenIndexes, end: this.lastToken } : tokenIndexes;
	}
}
