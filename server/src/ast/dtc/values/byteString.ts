import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { NumberWithLabelValue } from './number';

export class ByteStringValue extends ASTBase {
	constructor(public readonly values: (NumberWithLabelValue | null)[]) {
		super();
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: 'Byte String Value',
				kind: SymbolKind.Array,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.values.filter((v) => v).flatMap((v) => v!.getDocumentSymbols()),
			},
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.values.forEach((v) => v?.buildSemanticTokens(builder));
	}
}
