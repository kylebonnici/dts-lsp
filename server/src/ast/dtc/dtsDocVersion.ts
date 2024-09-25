import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { SymbolKind } from 'vscode-languageserver';

export class DtsDocumentVersion extends ASTBase {
	constructor(public readonly keyword: Keyword) {
		super();
		this.addChild(keyword);
		this.docSymbolsMeta = {
			name: 'DTS Douument version',
			kind: SymbolKind.Function,
		};
	}
}
