import { ASTBase } from '../../base';
import { SymbolKind } from 'vscode-languageserver';
import { LabledValue } from './labledValue';
import { NumberValue } from './number';

export class ByteStringValue extends ASTBase {
	constructor(public readonly values: LabledValue<NumberValue>[]) {
		super();
		this.docSymbolsMeta = {
			name: 'Byte String Value',
			kind: SymbolKind.Array,
		};
		this.values.forEach((value) => this.addChild(value));
	}
}
