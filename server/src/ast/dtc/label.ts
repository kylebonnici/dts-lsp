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
import { ASTBase } from "../base";
import { TokenIndexes } from "../../types";

export class LabelAssign extends ASTBase {
  constructor(public readonly label: string, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.docSymbolsMeta = {
      name: this.label,
      kind: SymbolKind.Constant,
    };
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return `${this.label}:`;
  }
}

export class Label extends ASTBase {
  constructor(public readonly value: string, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.docSymbolsMeta = {
      name: this.value,
      kind: SymbolKind.Variable,
    };
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }
}
