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

import { existsSync, readFileSync } from "fs";
import { Token } from "../types";
import { Lexer } from "../lexer";

let tokenizedDocumentProvider: TokenizedDocumentProvider | undefined;

class TokenizedDocumentProvider {
  private fileMap = new Map<string, Lexer>();

  static clone(tokens: Token[]) {
    const newList = tokens.map((t) => ({ ...t }));
    newList.forEach((t, i) => {
      t.prevToken = newList[i - 1];
      t.nextToken = newList[i + 1];
    });
    return newList;
  }

  renewLexer(uri: string, text?: string): Token[] {
    if (!uri || !existsSync(uri)) {
      return [];
    }

    text ??= readFileSync(uri).toString();
    const lexer = new Lexer(text, uri);
    this.fileMap.set(uri, lexer);
    return TokenizedDocumentProvider.clone(lexer.tokens);
  }

  requestTokens(uri: string, renewIfNotFound: boolean): Token[] {
    const tokens = this.fileMap.get(uri)?.tokens;
    if (!tokens && renewIfNotFound) {
      return [...this.renewLexer(uri)];
    }
    return TokenizedDocumentProvider.clone(tokens ?? []);
  }
}

export function getTokenizedDocumentProvider(): TokenizedDocumentProvider {
  tokenizedDocumentProvider ??= new TokenizedDocumentProvider();
  return tokenizedDocumentProvider;
}

export function resetTokenizedDocumentProvider() {
  tokenizedDocumentProvider = new TokenizedDocumentProvider();
}
