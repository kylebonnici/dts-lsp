import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { toRange } from '../../helpers';

export class LabelAssign extends ASTBase {
	public parent?: ASTBase;

	constructor(public readonly label: string) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.label,
				kind: SymbolKind.Module,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export class Label extends ASTBase {
	constructor(public readonly value: string) {
		super();
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.value,
				kind: SymbolKind.Module,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}
