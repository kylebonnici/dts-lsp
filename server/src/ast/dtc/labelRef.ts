import { ASTBase } from '../base';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { Label } from './label';

export class LabelRef extends ASTBase {
	constructor(public readonly label: Label | null) {
		super();
		this.addChild(label);
	}

	get value() {
		return this.label?.value;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: `&${this.label?.value ?? 'NULL'}`,
				kind: SymbolKind.Key,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		this.label?.buildSemanticTokens(push);
	}
}
