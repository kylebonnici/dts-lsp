import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { toRange } from '../../helpers';

export class LabelAssign extends ASTBase {
	constructor(public readonly label: string) {
		super();
		this.docSymbolsMeta = {
			name: this.label,
			kind: SymbolKind.Module,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class Label extends ASTBase {
	constructor(public readonly value: string) {
		super();
		this.docSymbolsMeta = {
			name: this.value,
			kind: SymbolKind.Module,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
}
