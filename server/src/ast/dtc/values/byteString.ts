import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { NumberWithLabelValue } from './number';

export class ByteStringValue extends ASTBase {
	constructor(public readonly values: (NumberWithLabelValue | null)[]) {
		super();
		this.docSymbolsMeta = {
			name: 'Byte String Value',
			kind: SymbolKind.Array,
		};
		this.values.forEach((value) => this.addChild(value));
	}
}
