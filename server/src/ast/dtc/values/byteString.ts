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

import { ASTBase } from "../../base";
import { SymbolKind } from "vscode-languageserver";
import { LabeledValue } from "./labeledValue";
import { NumberValue } from "./number";

export class ByteStringValue extends ASTBase {
  constructor(public readonly values: LabeledValue<NumberValue>[]) {
    super();
    this.docSymbolsMeta = {
      name: "Byte String Value",
      kind: SymbolKind.Array,
    };
    this.values.forEach((value) => this.addChild(value));
  }

  toString() {
    return `[${this.values.map((v) => v.toString()).join(" ")}]`;
  }
}
