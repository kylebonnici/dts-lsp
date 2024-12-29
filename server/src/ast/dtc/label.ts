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
import { BuildSemanticTokensPush, TokenIndexes } from "../../types";
import { LabelRef } from "./labelRef";
import { getTokenModifiers, getTokenTypes } from "../../helpers";

export class LabelAssign extends ASTBase {
  constructor(public readonly label: Label, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.docSymbolsMeta = {
      name: this.label.value,
      kind: SymbolKind.Constant,
    };
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
    this.addChild(label);
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

  buildSemanticTokens(push: BuildSemanticTokensPush): void {
    const parent = this.parentNode;
    if (!(parent instanceof LabelRef && parent.linksTo)) {
      super.buildSemanticTokens(push);
      return;
    }

    push(getTokenTypes("type"), getTokenModifiers("declaration"), {
      start: this.firstToken,
      end: this.lastToken,
    });
  }
}
