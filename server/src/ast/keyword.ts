import { TokenIndexes } from 'src/types';
import { ASTBase } from './base';

export class Keyword extends ASTBase {
	constructor(tokenIndexes?: TokenIndexes) {
		super(tokenIndexes);
		this.semanticTokenType = 'keyword';
		this.semanticTokenModifiers = 'declaration';
	}
}
