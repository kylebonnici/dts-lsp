import { ASTBase } from '../base';
import { Operator } from './operator';

export abstract class Expression extends ASTBase {
	public abstract evaluate(): string;
}

export class ComplexExpression extends Expression {
	constructor(
		public readonly expression: Expression,
		public readonly join?: { operator: Operator; expression: Expression }
	) {
		super();
		this.addChild(expression);
		if (join) {
			this.addChild(join.operator);
			this.addChild(join.expression);
		}
	}

	evaluate(): string {
		throw new Error('Not Implimented');
	}
}
