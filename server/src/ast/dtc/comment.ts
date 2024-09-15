import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { toRange } from '../../helpers';

export class Comment extends ASTBase {
	constructor() {
		super();
		this.semanticTokenType = 'comment';
		this.semanticTokenModifiers = 'documentation';
	}
}
