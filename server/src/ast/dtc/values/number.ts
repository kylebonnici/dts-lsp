import { ASTBase } from '../../base';
import { SymbolKind } from 'vscode-languageserver';
import { LabelAssign } from '../label';

export class NumberValue extends ASTBase {
	constructor(public readonly value: number) {
		super();
		this.docSymbolsMeta = {
			name: this.value.toString(),
			kind: SymbolKind.Number,
		};
		this.semanticTokenType = 'number';
		this.semanticTokenModifiers = 'declaration';
	}
}
