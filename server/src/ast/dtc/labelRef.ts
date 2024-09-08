import { ASTBase } from '../base';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { Label } from './label';

export class LabelRef extends ASTBase {
	constructor(public readonly ref: Label | null) {
		super();
	}

	get value() {
		return this.ref?.label;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: `&${this.ref?.label ?? 'NULL'}`,
				kind: SymbolKind.Key,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		this.ref?.buildSemanticTokens(push);
	}
}
