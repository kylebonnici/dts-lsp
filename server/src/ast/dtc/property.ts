import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { LabelAssign } from './label';
import { PropertyValues } from './values/values';

export class PropertyName extends ASTBase {
	constructor(public readonly name: string) {
		super();
		this.semanticTokenType = 'property';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.name,
				kind: SymbolKind.Property,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}

export class DtcProperty extends ASTBase {
	private _values: PropertyValues | null = null;

	constructor(
		public readonly propertyName: PropertyName | null,
		public readonly labels: LabelAssign[] = []
	) {
		super();
		this.labels.forEach((label) => this.addChild(label));
		this.addChild(propertyName);
	}

	get allLabels() {
		return [...this.labels, ...(this.values?.allLabels ?? [])];
	}

	set values(values: PropertyValues | null) {
		if (this._values) throw new Error('Only on property name is allowed');
		this._values = values;
		this.addChild(values);
	}

	get values() {
		return this._values;
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.propertyName?.name ?? 'Unknown',
				kind: SymbolKind.Property,
				range: toRange(this),
				selectionRange: toRange(this),
				children: [
					...(this.values?.getDocumentSymbols() ?? []),
					...this.labels.flatMap((label) => label.getDocumentSymbols()),
				],
			},
		];
	}
}
