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

import {
  DocumentSymbol,
  SemanticTokensBuilder,
  WorkspaceSymbol,
} from "vscode-languageserver";
import { Issue, LexerToken, SyntaxIssue, Token, TokenIndexes } from "./types";
import {
  adjacentTokens,
  createTokenIndex,
  genIssue,
  validateToken,
  validToken,
} from "./helpers";
import { ASTBase } from "./ast/base";
import { Parser } from "./parser";
import { CIdentifier } from "./ast/cPreprocessors/cIdentifier";
import { Operator, OperatorType } from "./ast/cPreprocessors/operator";
import { CMacro } from "./ast/cPreprocessors/macro";

export abstract class BaseParser {
  positionStack: number[] = [];
  protected _issues: Issue<SyntaxIssue>[] = [];

  protected parsing: Promise<void>;

  public abstract get uri(): string;
  public abstract get tokens(): Token[];
  protected abstract parse(): Promise<void>;
  public abstract reparse(macros?: Map<string, CMacro>): Promise<void>;

  constructor() {
    this.parsing = new Promise<void>((resolve) => {
      setTimeout(() => {
        this.parse().then(resolve);
      });
    });
  }

  protected reset() {
    this.issueLengthPositionStack = [];
    this.positionStack = [];
    this._issues = [];
  }

  get issues(): Issue<SyntaxIssue>[] {
    return this._issues;
  }

  get stable() {
    return this.parsing;
  }

  get done() {
    return this.peekIndex() >= this.tokens.length;
  }

  protected get moveToNextToken() {
    const token = this.currentToken;
    this.moveStackIndex();
    return token;
  }

  private issueLengthPositionStack: number[] = [];

  protected enqueueToStack() {
    this.issueLengthPositionStack.push(this._issues.length);
    this.positionStack.push(this.peekIndex());
  }

  protected popStack() {
    const prevLength = this.issueLengthPositionStack.pop() ?? 0;
    if (prevLength !== this._issues.length) {
      this._issues.splice(prevLength);
    }
    this.positionStack.pop();
  }

  protected mergeStack() {
    const length = this.issueLengthPositionStack.pop();
    const value = this.positionStack.pop();

    if (value === undefined || length === undefined) {
      /* istanbul ignore next */
      throw new Error("Index out of bounds");
    }

    this.positionStack[this.positionStack.length - 1] = value;
  }

  protected peekIndex(depth = 1) {
    const peek = this.positionStack.at(-1 * depth);
    if (peek === undefined) {
      /* istanbul ignore next */
      throw new Error("Index out of bounds");
    }

    return peek;
  }

  protected get currentToken() {
    return this.tokens.at(this.peekIndex());
  }

  protected get prevToken() {
    const index = this.peekIndex() - 1;
    if (index === -1) {
      return;
    }

    return this.tokens[index];
  }

  protected moveStackIndex() {
    if (this.positionStack[this.positionStack.length - 1] === undefined) {
      /* istanbul ignore next */
      throw new Error("Index out of bounds");
    }

    this.positionStack[this.positionStack.length - 1]++;
  }

  protected checkConcurrentTokens(
    cmps: ((
      token: Token | undefined,
      index?: number
    ) => "yes" | "no" | "partial")[]
  ) {
    this.enqueueToStack();

    const tokens: Token[] = [];

    cmps.every((cmp) => {
      const token = this.currentToken;
      const result = cmp(token);
      let continueLoop = false;

      if (result !== "no" && token) {
        tokens.push(token);
        this.moveToNextToken;
        continueLoop = adjacentTokens(token, this.currentToken);
      }
      return result === "yes" && continueLoop;
    });

    this.mergeStack();
    return tokens;
  }

  protected consumeAnyConcurrentTokens(
    cmps: ((
      token: Token | undefined,
      index?: number
    ) => "yes" | "no" | "partial")[]
  ) {
    this.enqueueToStack();

    const tokens: Token[] = [];

    let token: Token | undefined;
    let continueLoop = true;
    while (
      cmps.some((cmp) => cmp(this.currentToken) === "yes" && continueLoop)
    ) {
      tokens.push(this.currentToken!);
      token = this.currentToken;
      this.moveToNextToken;
      continueLoop = adjacentTokens(token, this.currentToken);
    }

    this.mergeStack();
    return tokens;
  }

  abstract get allAstItems(): ASTBase[];

  getDocumentSymbols(uri: string): DocumentSymbol[] {
    return this.allAstItems.flatMap((o) => o.getDocumentSymbols(uri));
  }

  getWorkspaceSymbols(): WorkspaceSymbol[] {
    return this.allAstItems.flatMap((o) => o.getWorkspaceSymbols());
  }

  buildSemanticTokens(tokensBuilder: SemanticTokensBuilder, uri: string) {
    const result: {
      line: number;
      char: number;
      length: number;
      tokenType: number;
      tokenModifiers: number;
    }[] = [];
    const push = (
      tokenType: number,
      tokenModifiers: number,
      tokenIndexes?: TokenIndexes
    ) => {
      if (
        !tokenIndexes?.start ||
        !tokenIndexes?.end ||
        tokenIndexes.start.uri !== uri ||
        tokenIndexes.end.uri !== uri
      )
        return;

      const lengthEnd =
        tokenIndexes.end.pos.col -
        tokenIndexes.start.pos.col +
        tokenIndexes.end.pos.len;
      result.push({
        line: tokenIndexes.start.pos.line,
        char: tokenIndexes.start.pos.col,
        length:
          tokenIndexes.end === tokenIndexes.start
            ? tokenIndexes.end.pos.len
            : lengthEnd,
        tokenType,
        tokenModifiers,
      });
    };

    this.allAstItems.forEach((a) => {
      a.buildSemanticTokens(push);
    });

    result
      .sort((a, b) => (a.line === b.line ? a.char - b.char : a.line - b.line))
      .forEach((r) =>
        tokensBuilder.push(
          r.line,
          r.char,
          r.length,
          r.tokenType,
          r.tokenModifiers
        )
      );
  }

  protected processCIdentifier(): CIdentifier | undefined {
    this.enqueueToStack();

    const valid = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
        validateToken
      )
    );

    if (!valid.length) {
      this.popStack();
      return undefined;
    }

    const name = valid.map((v) => v.value).join("");

    if (!name.match(/^[_A-Za-z]/)) {
      this.popStack();
      return;
    }

    const identifier = new CIdentifier(
      name,
      createTokenIndex(valid[0], valid.at(-1))
    );

    this.mergeStack();
    return identifier;
  }

  protected isOperator(): Operator | undefined {
    this.enqueueToStack();
    const start = this.moveToNextToken;

    if (!start) {
      this.popStack();
      return;
    }

    let end = start;

    let operator: OperatorType | undefined;
    if (validToken(start, LexerToken.AMPERSAND)) {
      operator = OperatorType.BIT_AND;
      if (validToken(this.currentToken, LexerToken.AMPERSAND)) {
        operator = OperatorType.BOOLEAN_AND;
        end = this.moveToNextToken;
      }
    } else if (validToken(start, LexerToken.BIT_NOT)) {
      operator = OperatorType.BIT_NOT;
      if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
        operator = OperatorType.BOOLEAN_NOT_EQ;
        end = this.moveToNextToken;
      }
    } else if (validToken(start, LexerToken.BIT_OR)) {
      operator = OperatorType.BIT_OR;
      if (validToken(this.currentToken, LexerToken.BIT_OR)) {
        operator = OperatorType.BOOLEAN_OR;
        end = this.moveToNextToken;
      }
    } else if (validToken(start, LexerToken.BIT_XOR)) {
      operator = OperatorType.BIT_XOR;
    } else if (validToken(start, LexerToken.GT_SYM)) {
      operator = OperatorType.BOOLEAN_GT;
      if (validToken(this.currentToken, LexerToken.GT_SYM)) {
        operator = OperatorType.BIT_RIGHT_SHIFT;
        end = this.moveToNextToken;
      } else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
        operator = OperatorType.BOOLEAN_GT_EQUAL;
        end = this.moveToNextToken;
      }
    } else if (validToken(start, LexerToken.LT_SYM)) {
      operator = OperatorType.BOOLEAN_GT;
      if (validToken(this.currentToken, LexerToken.LT_SYM)) {
        operator = OperatorType.BIT_LEFT_SHIFT;
        end = this.moveToNextToken;
      } else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
        operator = OperatorType.BOOLEAN_LT_EQUAL;
        end = this.moveToNextToken;
      }
    } else if (validToken(start, LexerToken.ADD_OPERATOR)) {
      operator = OperatorType.ARITHMETIC_ADD;
    } else if (validToken(start, LexerToken.NEG_OPERATOR)) {
      operator = OperatorType.ARITHMETIC_SUBTRACT;
    } else if (validToken(start, LexerToken.MULTI_OPERATOR)) {
      operator = OperatorType.ARITHMETIC_MULTIPLE;
    } else if (validToken(start, LexerToken.FORWARD_SLASH)) {
      operator = OperatorType.ARITHMETIC_DIVIDE;
    } else if (validToken(start, LexerToken.MODULUS_OPERATOR)) {
      operator = OperatorType.ARITHMETIC_MODULES;
    } else if (validToken(start, LexerToken.HASH)) {
      if (validToken(this.currentToken, LexerToken.HASH)) {
        operator = OperatorType.C_CONCAT;
        end = this.moveToNextToken;
      }
    }

    if (operator) {
      const node = new Operator(operator, createTokenIndex(start, end));
      this.mergeStack();
      return node;
    }
    this.popStack();
    return;
  }

  protected parseScopedBlock(
    isOpen: (token?: Token) => boolean,
    isClose: (token?: Token) => boolean,
    isSplit?: (token?: Token) => boolean
  ): Block | undefined {
    this.enqueueToStack();

    const start = this.moveToNextToken;
    if (!start || !isOpen(start)) {
      this.popStack();
      return;
    }

    const items: BlockItem[] = [];
    const split: Token[][] = [];
    split[0] = [];

    while (!isClose(this.currentToken)) {
      const token = this.moveToNextToken;

      if (isSplit?.(token)) {
        split[split.length] = [];
      }

      if (token) {
        items.push(token);
        split[split.length - 1].push(token);
      }

      if (isOpen(this.currentToken)) {
        const nestedBlock = this.parseScopedBlock(isOpen, isClose, isSplit);
        if (nestedBlock) {
          items.push(nestedBlock);
          split[split.length - 1].push(
            nestedBlock.startToken,
            ...nestedBlock.splitTokens.flat(),
            nestedBlock.endToken
          );
        }
      }
    }

    const end = this.moveToNextToken;

    const block: Block = {
      startToken: start,
      items,
      splitTokens: split,
      endToken: end,
    };

    this.mergeStack();
    return block;
  }

  protected moveEndOfLine = (token: Token, report = true) => {
    const line = token.pos.line;
    if (
      this.currentToken?.pos.line !== line ||
      this.currentToken?.uri !== token.uri
    ) {
      return;
    }

    const start = this.currentToken;
    let end: Token | undefined = start;
    while (this.currentToken?.pos.line === line) {
      end = this.moveToNextToken;
    }

    if (report) {
      const node = new ASTBase(createTokenIndex(start, end));
      this._issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
    }

    return end;
  };

  getTokenIndex(token?: Token) {
    return token ? this.tokens.findIndex((item) => item === token) : -1;
  }
}

export type BlockItem = Token | Block;
export interface Block {
  startToken: Token;
  items: BlockItem[];
  splitTokens: Token[][];
  endToken: Token;
}
