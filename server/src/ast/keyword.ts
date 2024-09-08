import { ASTBase } from './base';

export class Keyword extends ASTBase {
	constructor() {
		super();
		this.semanticTokenType = 'keyword';
		this.semanticTokenModifiers = 'declaration';
	}
}
