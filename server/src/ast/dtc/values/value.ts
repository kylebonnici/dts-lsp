import { ASTBase } from '../../base';
import { BuildSemanticTokensPush } from '../../../types';
import { AllValueType } from '../types';
import { DocumentSymbol } from 'vscode-languageserver';
import { LabelAssign } from '../label';
import { NodePathValue } from './nodePath';
import { LabelRefValue } from './labelRef';
import { ByteStringValue } from './byteString';
import { NumberValues } from './number';
import { LabelRef } from '../labelRef';

export class PropertyValue extends ASTBase {
	constructor(
		public readonly value: AllValueType,
		public readonly endLabels: LabelAssign[]
	) {
		super();
		this.addChild(value);
		this.endLabels.forEach((label) => {
			this.addChild(label);
		});
	}
}
