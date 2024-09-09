import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { LabelAssign } from '../label';
import { PropertyValue } from './value';

export class PropertyValues extends ASTBase {
	constructor(
		public readonly values: (PropertyValue | null)[],
		public readonly labels: LabelAssign[]
	) {
		super();
		this.labels.forEach((label) => {
			this.addChild(label);
		});
		this.values.forEach((value) => this.addChild(value));
	}

	get allLabels() {
		return [
			...this.labels,
			...this.values.flatMap((value) => value?.allLabels).filter((v) => v),
		];
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Property Values',
				kind: SymbolKind.String,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...this.labels.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
					...this.values.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
				],
			},
		];
	}
}
