import { ASTBase } from '../../base';
import { SymbolKind } from 'vscode-languageserver';
import { TokenIndexes } from '../../../types';

export class StringValue extends ASTBase {
	constructor(public readonly value: string, _tokenIndexes?: TokenIndexes) {
		super(_tokenIndexes);
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
		this.docSymbolsMeta = {
			name: this.value,
			kind: SymbolKind.String,
		};
	}
}
