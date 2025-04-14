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

import { ASTBase } from "../base";
import { Operator } from "./operator";
import type { MacroRegistryItem } from "../../types";
import { expandMacros } from "../../helpers";

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

  resolve(macros: (name: string) => MacroRegistryItem | undefined) {
    return expandMacros(this.toString(), macros);
  }

  evaluate(macros: (name: string) => MacroRegistryItem | undefined) {
    return evalExp(this.resolve(macros));
  }

  isTrue(macros: (name: string) => MacroRegistryItem | undefined): boolean {
    return evalExp(`!!(${this.resolve(macros)})`);
  }

  toPrettyString(macros: (name: string) => MacroRegistryItem | undefined) {
    const value = this.evaluate(macros);

    return `${value.toString()} /* ${this.toString()}${
      typeof value === "number" ? ` = 0x${value.toString(16)}` : ""
    } */`;
  }
}

export class ComplexExpression extends Expression {
  constructor(
    public readonly expression: Expression,
    private wrapped: boolean,
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
    const exp = this.children.map((c) => c.toString()).join(" ");
    if (this.wrapped) {
      return `(${exp})`;
    }
    return `${exp}`;
  }

  isTrue(macros: (name: string) => MacroRegistryItem | undefined): boolean {
    const exp = `(${this.children
      .map((c) => (c instanceof Expression ? c.resolve(macros) : c.toString()))
      .join(" ")})`;
    return evalExp(`!!${exp}`);
  }
}
