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

import { LexerToken, Token } from "./types";
import { adjacentTokens, createTokenIndex, validToken } from "./helpers";
import { Comment } from "./ast/dtc/comment";
import { BaseParser } from "./baseParser";
import { ASTBase } from "./ast/base";
import { getTokenizedDocumentProvider } from "./providers/tokenizedDocument";

export class CommentsParser extends BaseParser {
  comments: Comment[] = [];
  public tokens: Token[] = [];

  constructor(public readonly uri: string) {
    super();
  }

  private cleanUpComments() {
    const tokensUsed: number[] = [];
    for (let i = 0; i < this.tokens.length; i++) {
      const result =
        CommentsParser.processBlockComments(this.tokens, i) ||
        CommentsParser.processLineComments(this.tokens, i);
      if (result) {
        i = result.index;
        tokensUsed.push(...result.tokenUsed);
        this.comments.push(...result.comments);
      }
    }
    tokensUsed.reverse().forEach((i) => this.tokens.splice(i, 1));
  }

  get allAstItems(): ASTBase[] {
    return this.comments;
  }

  protected reset() {
    super.reset();
    this.comments = [];
  }

  public reparse() {
    this.reset();
    return this.parse();
  }

  protected async parse() {
    this.tokens = getTokenizedDocumentProvider().requestTokens(this.uri, true);
    this.cleanUpComments();
  }

  private static processBlockComments(tokens: Token[], index: number) {
    const tokenUsed: number[] = [];

    const move = () => {
      tokenUsed.push(index++);
      return tokens[index];
    };

    const currentToken = () => {
      return tokens[index];
    };

    const prevToken = () => {
      return tokens[index - 1];
    };

    const firstToken = currentToken();
    let token = firstToken;
    if (!firstToken || !validToken(firstToken, LexerToken.FORWARD_SLASH)) {
      return;
    }

    token = move();

    if (
      !validToken(token, LexerToken.MULTI_OPERATOR) ||
      firstToken.pos.line !== token.pos.line ||
      firstToken.pos.col + 1 !== token.pos.col
    ) {
      return;
    }

    const isEndComment = (): boolean => {
      if (!validToken(prevToken(), LexerToken.MULTI_OPERATOR)) {
        return false;
      }

      if (
        !validToken(currentToken(), LexerToken.FORWARD_SLASH) ||
        !adjacentTokens(prevToken(), currentToken())
      ) {
        return false;
      }

      return true;
    };

    // we have a comment start
    let lastLine = token.pos.line;
    let start = firstToken;
    const comments: Comment[] = [];
    token = move();
    do {
      if (currentToken()?.pos.line !== lastLine) {
        const node = new Comment(createTokenIndex(start, prevToken()));
        comments.push(node);

        lastLine = currentToken().pos.line ?? 0;

        start = currentToken();
      }
      token = move();
    } while (index < tokens.length && !isEndComment());

    const node = new Comment(createTokenIndex(start, currentToken()));
    comments.push(node);

    move();
    return {
      comments,
      tokenUsed,
      index: index - 1,
    };
  }

  private static processLineComments(tokens: Token[], index: number) {
    const tokenUsed: number[] = [];

    if (
      !validToken(tokens[index], LexerToken.FORWARD_SLASH) ||
      tokens.length === index + 1 ||
      !validToken(tokens[index + 1], LexerToken.FORWARD_SLASH)
    ) {
      return;
    }

    const comments: Comment[] = [];

    while (tokens[index].pos.line === tokens.at(index + 1)?.pos.line) {
      tokenUsed.push(index++);
    }

    tokenUsed.push(index++);

    const lastToken = tokens[tokenUsed.at(-1)!];
    const node = new Comment(
      createTokenIndex(tokens[tokenUsed[0]], tokens[tokenUsed.at(-1)!])
    );

    comments.push(node);

    return {
      comments,
      tokenUsed,
      index: index - 1,
    };
  }
}
