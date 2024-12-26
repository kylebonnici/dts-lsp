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

import { CIdentifier } from "./cIdentifier";
import { FunctionDefinition } from "./functionDefinition";
import { Keyword } from "../keyword";
import { ASTBase } from "../base";
import { LexerToken, Token, TokenIndexes } from "../../types";
import { validToken } from "../../helpers";

export class CMacroContent extends ASTBase {
  constructor(tokenIndexes: TokenIndexes, public readonly content: Token[]) {
    super(tokenIndexes);
  }

  toString() {
    const allDataTokens = this.content.filter(
      (t) => !validToken(t, LexerToken.BACK_SLASH)
    );

    return allDataTokens
      .map((p, i) => {
        let v = p.value;
        if (p.pos.line === allDataTokens.at(i + 1)?.pos.line) {
          v = v.padEnd(allDataTokens[i + 1].pos.col - p.pos.col, " ");
        } else if (allDataTokens.at(i + 1)) {
          v = v.padEnd(v.length + 1, " ");
        }
        return v;
      })
      .join("");
  }
}

export class CMacro extends ASTBase {
  constructor(
    public readonly keyword: Keyword,
    public readonly identifier: CIdentifier | FunctionDefinition,
    public readonly content?: CMacroContent
  ) {
    super();
    this.addChild(keyword);
    this.addChild(this.identifier);
    if (this.content) {
      this.addChild(this.content);
    }
  }

  get name() {
    return this.identifier instanceof CIdentifier
      ? this.identifier.name
      : this.identifier.functionName.name;
  }

  toString() {
    return [
      this.identifier.toString(),
      ...(this.content ? [this.content?.toString()] : []),
    ].join(" ");
  }
}
