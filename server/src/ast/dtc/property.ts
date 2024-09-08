import { BuildSemanticTokensPush } from '../../types';
import { ASTBase } from '../base';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { toRange } from '../../helpers';
import { Label } from './label';
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
	public values: PropertyValues | null = null;

	constructor(
		public readonly propertyName: PropertyName | null,
		public readonly labels: Label[] = []
	) {
		super();
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

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.propertyName?.buildSemanticTokens(builder);
		this.values?.buildSemanticTokens(builder);
		this.labels.forEach((label) => label.buildSemanticTokens(builder));
	}
}
