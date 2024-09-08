import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { LabelAssign } from '../label';

export class NumberValues extends ASTBase {
	constructor(public readonly values: NumberWithLabelValue[]) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Cell Array',
				kind: SymbolKind.Array,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.values.flatMap((v) => v.getDocumentSymbols()),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		return this.values.forEach((v) => v.buildSemanticTokens(builder));
	}
}

export class NumberWithLabelValue extends ASTBase {
	constructor(public readonly number: NumberValue, public readonly labels: LabelAssign[]) {
		super();
		this.labels.forEach((label) => {
			label.parent = this;
		});
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...this.number.getDocumentSymbols(),
			...this.labels.flatMap((label) => label.getDocumentSymbols()),
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		this.number.buildSemanticTokens(push);
		this.labels.forEach((label) => label.buildSemanticTokens(push));
	}
}

export class NumberValue extends ASTBase {
	constructor(public readonly value: number) {
		super();
		this.semanticTokenType = 'number';
		this.semanticTokenModifiers = 'declaration';
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.value.toString(),
				kind: SymbolKind.Number,
				range: toRange(this),
				selectionRange: toRange(this),
			},
		];
	}
}
