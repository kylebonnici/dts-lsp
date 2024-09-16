import { ASTBase } from '../../base';
import { AllValueType } from '../types';
import { LabelAssign } from '../label';

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
