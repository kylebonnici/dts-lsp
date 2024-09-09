import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { LabelAssign } from '../label';

export class NumberValues extends ASTBase {
	constructor(public readonly values: NumberWithLabelValue[]) {
		super();
		this.docSymbolsMeta = {
			name: 'Cell Array',
			kind: SymbolKind.Array,
		};
		this.values.forEach((value) => this.addChild(value));
	}
}

export class NumberWithLabelValue extends ASTBase {
	constructor(public readonly number: NumberValue, public readonly labels: LabelAssign[]) {
		super();
		this.labels.forEach((label) => {
			this.addChild(label);
		});
		this.addChild(this.number);
	}
}

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
