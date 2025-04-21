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

import { SymbolKind } from "vscode-languageserver";
import { Expression } from "../../cPreprocessors/expression";
import { MacroRegistryItem, TokenIndexes } from "../../../types";
import {
  SerializableExpressionBase,
  SerializableNumberValue,
} from "../../../types/index";

export class NumberValue extends Expression {
  constructor(public readonly value: number, tokenIndexes: TokenIndexes) {
    super(tokenIndexes);
    this.docSymbolsMeta = {
      name: this.value.toString(),
      kind: SymbolKind.Number,
    };
    this.semanticTokenType = "number";
    this.semanticTokenModifiers = "declaration";
  }

  toString(radix?: number) {
    return this.value.toString(radix);
  }

  toJson() {
    return this.value;
  }

  toPrettyString(macros: Map<string, MacroRegistryItem>): string {
    const value = this.evaluate(macros);

    return `${value.toString()} /* ${
      typeof value === "number" ? `0x${value.toString(16)}` : ""
    } */`;
  }

  serialize(): SerializableExpressionBase {
    return new SerializableNumberValue(
      this.value.toString(),
      this.value,
      this.uri,
      this.range
    );
  }
}
