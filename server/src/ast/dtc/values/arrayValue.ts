import { ASTBase } from '../../base';
import { SymbolKind } from 'vscode-languageserver';
import { LabelRef } from '../labelRef';
import { NodePathRef } from './nodePath';
import { NumberValue } from './number';
import { LabledValue } from './labledValue';

export class ArrayValues extends ASTBase {
	constructor(public readonly values: LabledValue<NumberValue | LabelRef | NodePathRef>[]) {
		super();
		this.docSymbolsMeta = {
			name: 'Cell Array',
			kind: SymbolKind.Array,
		};
		this.values.forEach((value) => this.addChild(value));
	}
}
