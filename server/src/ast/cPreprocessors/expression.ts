/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ContextAware } from "src/runtimeEvaluator";
import { ASTBase } from "../base";
import { Operator } from "./operator";

function sanitizeCExpression(expr: string) {
  return expr
    .replace(/'(.)'/g, (_, char: string) => char.charCodeAt(0).toString())
    .replace(/(0x[a-f\d]+|\d+)[ul]*/gi, "$1");
}

function evalExp(str: string) {
  try {
    return (0, eval)(sanitizeCExpression(str));
  } catch (e) {
    console.log(e);
  }
  return str;
}

export abstract class Expression extends ASTBase {
  toJson() {
    return -1;
  }

  evaluate(context: ContextAware) {
    return evalExp(context.expandMacros(this.toString()));
  }
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

  addExpression(operator: Operator, expression: Expression) {
    this.addChild(operator);
    this.addChild(expression);
  }

  toString() {
    return `(${this.children.map((c) => c.toString()).join(" ")})`;
  }
}
