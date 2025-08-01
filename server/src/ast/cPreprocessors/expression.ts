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
import type { MacroRegistryItem, Token } from "../../types";
import { evalExp, expandMacros } from "../../helpers";
import {
  SerializableExpression,
  SerializableNumberValue,
} from "../../types/index";

export abstract class Expression extends ASTBase {
  toJson() {
    return -1;
  }

  resolve(macros: Map<string, MacroRegistryItem>) {
    return expandMacros(this.toString(), macros);
  }

  evaluate(macros: Map<string, MacroRegistryItem>) {
    return evalExp(this.resolve(macros));
  }

  isTrue(macros: Map<string, MacroRegistryItem>): boolean {
    return evalExp(`!!(${this.resolve(macros)})`);
  }

  toPrettyString(macros: Map<string, MacroRegistryItem>) {
    const value = this.evaluate(macros);

    return `${value.toString()} /* ${this.toString()}${
      typeof value === "number" ? ` = 0x${value.toString(16)}` : ""
    } */`;
  }

  serialize(
    macros: Map<string, MacroRegistryItem>
  ): SerializableNumberValue | SerializableExpression {
    return new SerializableExpression(
      this.toString(),
      this.evaluate(macros),
      this.serializeUri,
      this.range,
      this.serializeIssues
    );
  }
}

export class ComplexExpression extends Expression {
  public openBracket?: Token;
  public closeBracket?: Token;

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

  get firstToken() {
    if (this.openBracket) return this.openBracket;
    return super.firstToken;
  }

  get lastToken() {
    if (this.closeBracket) return this.closeBracket;
    return super.lastToken;
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

  isTrue(macros: Map<string, MacroRegistryItem>): boolean {
    const exp = `(${this.children
      .map((c) => (c instanceof Expression ? c.resolve(macros) : c.toString()))
      .join(" ")})`;
    return evalExp(`!!${exp}`);
  }
}
