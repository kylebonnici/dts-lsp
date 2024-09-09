import { ASTBase } from '../base';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { Label } from './label';

export class LabelRef extends ASTBase {
	constructor(public readonly label: Label | null) {
		super();
		this.docSymbolsMeta = {
			name: `&${this.label?.value ?? 'NULL'}`,
			kind: SymbolKind.Key,
		};
		this.addChild(label);
	}

	get value() {
		return this.label?.value;
	}
}
