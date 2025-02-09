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
import { SymbolKind } from "vscode-languageserver";
import { Label } from "./label";
import { type Node } from "../../context/node";

export class LabelRef extends ASTBase {
  public linksTo?: Node;

  constructor(public readonly label: Label | null) {
    super();
    this.docSymbolsMeta = {
      name: `&${this.label?.value ?? "NULL"}`,
      kind: SymbolKind.Key,
    };
    this.addChild(label);
  }

  get value() {
    return this.label?.value;
  }

  toString() {
    return `&${this.label?.value ?? "NULL"}`;
  }

  toJson() {
    return -1;
  }
}
