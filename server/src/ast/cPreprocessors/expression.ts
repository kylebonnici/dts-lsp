import { ASTBase } from "../base";
import { Operator } from "./operator";

export abstract class Expression extends ASTBase {}

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

  addExpression(operator: Operator, expression: Expression) {
    this.addChild(operator);
    this.addChild(expression);
  }

  toString() {
    return `(${this.children.map((c) => c.toString()).join(" ")})`;
  }
}
