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
import { Token, TokenIndexes } from "../../types";

export class CommentBlock extends ASTBase {
  constructor(readonly comments: Comment[]) {
    super();
    comments.forEach(this.addChild.bind(this));
  }
  toString(): string {
    return this.comments.map((c) => c.toString()).join("\n");
  }
}

export class Comment extends ASTBase {
  constructor(tokenIndexes: TokenIndexes) {
    super(tokenIndexes);
    this.semanticTokenType = "comment";
    this.semanticTokenModifiers = "documentation";
  }

  toString(): string {
    let prev: Token | undefined;
    let token: Token | undefined = this.firstToken;
    let str = "";
    while (token !== this.lastToken) {
      str += token?.value.padStart(
        token.value.length + (prev ? token.pos.col - prev.pos.colEnd : 0),
        " "
      );
      prev = token;
      token = token?.nextToken;
    }

    if (token) {
      str += token?.value.padStart(
        token.value.length + (prev ? token.pos.col - prev.pos.colEnd : 0),
        " "
      );
    }

    const match = str.match(/^\s*(?:(?:\/\/|\/\*+)\s*)?(.*?)\s*(?:\*\/)?\s*$/s);
    return match ? match[1] : "";
  }
}
