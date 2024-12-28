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

import { TokenIndexes } from "../../types";
import { ASTBase } from "../base";
import { SymbolKind } from "vscode-languageserver";
import { LabelAssign } from "./label";
import { PropertyValues } from "./values/values";

export class PropertyName extends ASTBase {
  constructor(public readonly name: string, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.semanticTokenType = "property";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return this.name;
  }
}

export class DtcProperty extends ASTBase {
  private _values: PropertyValues | null = null;

  constructor(
    public readonly propertyName: PropertyName | null,
    public readonly labels: LabelAssign[] = []
  ) {
    super();
    this.docSymbolsMeta = {
      name: this.propertyName?.name ?? "Unknown",
      kind: SymbolKind.Property,
    };
    this.labels.forEach((label) => this.addChild(label));
    this.addChild(propertyName);
  }

  set values(values: PropertyValues | null) {
    if (this._values) throw new Error("Only on property name is allowed");
    this._values = values;
    this.addChild(values);
  }

  get values() {
    return this._values;
  }

  toString() {
    return `${this.propertyName?.toString() ?? "__UNSET__"}${
      this._values?.values.length
        ? ` = ${this._values.values
            .map((v) => v?.toString() ?? "NULL")
            .join(", ")}`
        : ""
    };`;
  }
}
