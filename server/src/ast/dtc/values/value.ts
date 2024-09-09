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

	get allLabels() {
		const label: (LabelAssign | undefined)[] = [];
		if (this.value instanceof NodePathValue) {
			label.push(...this.value.labels);
		} else if (this.value instanceof LabelRefValue) {
			label.push(...this.value.labels);
		} else if (this.value instanceof ByteStringValue) {
			label.push(...this.value.values.flatMap((value) => value?.labels));
		} else if (this.value instanceof NumberValues) {
			label.push(...this.value.values.flatMap((value) => value?.labels));
		}
		return [...label, ...this.endLabels];
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...(this.value?.getDocumentSymbols() ?? []),
			...this.endLabels.flatMap((label) => label.getDocumentSymbols() ?? []),
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.value?.buildSemanticTokens(builder);
		this.endLabels.forEach((label) => label?.buildSemanticTokens(builder));
	}
}
