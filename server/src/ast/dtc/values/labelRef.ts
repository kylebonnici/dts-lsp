import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { Label, LabelAssign } from '../label';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';

export class LabelRefValue extends ASTBase {
	constructor(public readonly value: Label | null, public readonly labels: LabelAssign[]) {
		super();
		this.labels.forEach((label) => this.addChild(label));
		this.addChild(value);
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.value?.value ?? 'NULL',
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.value?.buildSemanticTokens(builder);
	}
}
