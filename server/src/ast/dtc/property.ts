import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { LabelAssign } from './label';
import { PropertyValues } from './values/values';

export class PropertyName extends ASTBase {
	constructor(public readonly name: string) {
		super();
		this.docSymbolsMeta = {
			name: this.name,
			kind: SymbolKind.Property,
		};
		this.semanticTokenType = 'property';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class DtcProperty extends ASTBase {
	private _values: PropertyValues | null = null;

	constructor(
		public readonly propertyName: PropertyName | null,
		public readonly labels: LabelAssign[] = []
	) {
		super();
		this.docSymbolsMeta = {
			name: this.propertyName?.name ?? 'Unknown',
			kind: SymbolKind.Property,
		};
		this.labels.forEach((label) => this.addChild(label));
		this.addChild(propertyName);
	}

	set values(values: PropertyValues | null) {
		if (this._values) throw new Error('Only on property name is allowed');
		this._values = values;
		this.addChild(values);
	}

	get values() {
		return this._values;
	}
}
