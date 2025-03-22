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

import { LexerToken, SyntaxIssue, Token } from "./types";
import {
  createTokenIndex,
  genIssue,
  sameLine,
  validateToken,
  validateValue,
  validToken,
} from "./helpers";
import { ASTBase } from "./ast/base";
import { Keyword } from "./ast/keyword";
import { Include, IncludePath } from "./ast/cPreprocessors/include";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { BaseParser, Block } from "./baseParser";
import { getTokenizedDocumentProvider } from "./providers/tokenizedDocument";
import { CommentsParser } from "./commentsParser";
import { CMacro, CMacroContent } from "./ast/cPreprocessors/macro";
import { CIdentifier } from "./ast/cPreprocessors/cIdentifier";
import {
  FunctionDefinition,
  Variadic,
} from "./ast/cPreprocessors/functionDefinition";
import {
  CElse,
  CIfDef,
  CIfNotDef,
  CPreprocessorContent,
  IfDefineBlock,
} from "./ast/cPreprocessors/ifDefine";
import { DiagnosticSeverity } from "vscode-languageserver";
import { getCachedCPreprocessorParserProvider } from "./providers/cachedCPreprocessorParser";

export class CPreprocessorParser extends BaseParser {
  public tokens: Token[] = [];
  private nodes: ASTBase[] = [];
  public dtsIncludes: Include[] = [];
  private macroSnapShot: Map<string, CMacro> = new Map<string, CMacro>();
  public readonly macros: Map<string, CMacro> = new Map<string, CMacro>();

  // tokens must be filtered out from comments by now
  constructor(
    public readonly uri: string,
    private incudes: string[],
    macros: Map<string, CMacro>
  ) {
    super();
    Array.from(macros).forEach(([k, m]) => this.macroSnapShot.set(k, m));
    Array.from(macros).forEach(([k, m]) => this.macros.set(k, m));
  }

  protected reset() {
    super.reset();
    this.macros.clear();
    Array.from(this.macroSnapShot).forEach(([k, m]) => this.macros.set(k, m));
    this.nodes = [];
    this.dtsIncludes = [];
  }

  public async reparse(macros?: Map<string, CMacro>): Promise<void> {
    const stable = this.stable;
    this.parsing = new Promise<void>((resolve) => {
      stable.then(() => {
        if (macros && macros.size === this.macroSnapShot.size) {
          const arr = Array.from(macros);
          if (
            Array.from(this.macroSnapShot).every(([k, m], i) => {
              const [kk, mm] = arr[i];
              return kk === k && mm.toString() === m.toString();
            })
          ) {
            console.log("header file cache hit", this.uri);
            resolve();
            return;
          }
        }
        console.log("header file cache miss", this.uri);
        this.reset();
        this.parse().then(resolve);
      });
    });
    return this.parsing;
  }

  public async parse() {
    const commentsParser = new CommentsParser(this.uri);
    await commentsParser.stable;
    this.tokens = commentsParser.tokens;
    this.nodes.push(...commentsParser.allAstItems);

    this.positionStack.push(0);
    if (this.tokens.length === 0) {
      return;
    }

    while (!this.done) {
      await this.lineProcessor();
    }

    if (this.positionStack.length !== 1) {
      /* istanbul ignore next */
      throw new Error("Incorrect final stack size");
    }
  }

  private async lineProcessor() {
    this.enqueueToStack();

    //must be firstToken
    const isFisrtTokenOnLine =
      !this.prevToken ||
      this.prevToken.pos.line !== this.currentToken?.pos.line ||
      this.prevToken.uri !== this.currentToken?.uri;
    if (!isFisrtTokenOnLine) {
      this.moveEndOfLine(this.prevToken!, false);
      this.mergeStack();
      return;
    }

    const token = this.currentToken;
    const found =
      (await this.processInclude()) ||
      this.processDefinitions() ||
      this.processIfDefBlocks();

    if (token) {
      this.moveEndOfLine(token, !!found);
    }

    this.mergeStack();
  }

  private processDefinitions() {
    this.enqueueToStack();

    const startIndex = this.peekIndex();
    const token = this.moveToNextToken;
    if (!token || !validToken(token, LexerToken.C_DEFINE)) {
      this.popStack();
      return false;
    }

    const keyword = new Keyword(createTokenIndex(token));

    const definition = this.isFunctionDefinition() || this.processCIdentifier();
    if (!definition) {
      this._issues.push(
        genIssue(SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE, keyword)
      );
      this.mergeStack();
      return true;
    }

    const definitionContent = this.consumeDefinitionContent();
    let content: CMacroContent | undefined;
    if (definitionContent.length) {
      content = new CMacroContent(
        createTokenIndex(definitionContent[0], definitionContent.at(-1)),
        definitionContent
      );
    }
    const macro = new CMacro(keyword, definition, content);
    this.macros.set(macro.name, macro);
    this.nodes.push(macro);

    const endIndex = this.peekIndex();
    this.tokens.splice(startIndex, endIndex - startIndex);

    this.positionStack[this.positionStack.length - 1] = startIndex;
    this.mergeStack();
    return true;
  }

  private consumeDefinitionContent(): Token[] {
    const tokens: Token[] = [];

    let prevToken = this.prevToken;

    while (
      sameLine(prevToken, this.currentToken) ||
      (prevToken && // allow to break line at end of line with \
        validToken(prevToken, LexerToken.BACK_SLASH) &&
        prevToken.pos.line + 1 === this.currentToken?.pos.line)
    ) {
      prevToken = this.moveToNextToken;
      if (prevToken) {
        tokens.push(prevToken);
      }
    }

    return tokens;
  }

  protected isFunctionDefinition(): FunctionDefinition | undefined {
    this.enqueueToStack();
    const identifier = this.processCIdentifier();
    if (!identifier) {
      this.popStack();
      return;
    }

    let token = this.moveToNextToken;
    if (!validToken(token, LexerToken.ROUND_OPEN)) {
      this.popStack();
      return;
    }

    const params: (CIdentifier | Variadic)[] = [];
    let param = this.processCIdentifier() || this.processVariadic();
    while (param) {
      params.push(param);
      if (
        !validToken(this.currentToken, LexerToken.COMMA) &&
        !validToken(this.currentToken, LexerToken.ROUND_CLOSE)
      ) {
        this._issues.push(genIssue(SyntaxIssue.MISSING_COMMA, param));
      } else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
        token = this.moveToNextToken;
      }
      param = this.processCIdentifier() || this.processVariadic();
    }

    const node = new FunctionDefinition(identifier, params);

    if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
      node.lastToken = this.prevToken;
      this._issues.push(
        genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? node)
      );
    } else {
      token = this.moveToNextToken;
      node.lastToken = token;
    }

    this.mergeStack();
    return node;
  }

  private processVariadic() {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.PERIOD),
      validateToken(LexerToken.PERIOD),
      validateToken(LexerToken.PERIOD),
    ]);

    if (valid.length !== 3) {
      this.popStack();
      return;
    }

    const variadic = new Variadic(createTokenIndex(valid[0], valid.at(-1)));
    this.mergeStack();
    return variadic;
  }

  private processIfDefBlocks() {
    const startIndex = this.peekIndex();

    const block = this.parseScopedBlock(
      (token?: Token) => {
        return (
          !!token &&
          [LexerToken.C_IFDEF, LexerToken.C_IFNDEF].some((t) =>
            validToken(token, t)
          ) &&
          !sameLine(token.prevToken, token)
        );
      },
      (token?: Token) => {
        return (
          !!token &&
          [LexerToken.C_ENDIF].some((t) => validToken(token, t)) &&
          !sameLine(token.prevToken, token)
        );
      },
      (token?: Token) => {
        return (
          !!token &&
          [LexerToken.C_ELSE].some((t) => validToken(token, t)) &&
          !sameLine(token.prevToken, token)
        );
      }
    );
    if (!block) {
      return;
    }

    if (
      validToken(block.startToken, LexerToken.C_IFDEF) ||
      validToken(block.startToken, LexerToken.C_IFNDEF)
    ) {
      let ifDefBlock: IfDefineBlock | undefined;
      if (validToken(block.startToken, LexerToken.C_IFDEF)) {
        ifDefBlock = this.processIfDefBlock(
          block,
          (
            keyword: Keyword,
            identifier: CIdentifier | null,
            content: CPreprocessorContent
          ) => new CIfDef(keyword, identifier ?? null, content)
        );
      } else {
        ifDefBlock = this.processIfDefBlock(
          block,
          (
            keyword: Keyword,
            identifier: CIdentifier | null,
            content: CPreprocessorContent
          ) => new CIfNotDef(keyword, identifier ?? null, content)
        );
      }

      this.nodes.push(ifDefBlock);

      const rangeToClean = ifDefBlock
        .getInValidTokenRange(this.macros, this.tokens)
        .reverse();
      rangeToClean.forEach((r) => {
        this.tokens.splice(r.start, r.end - r.start + 1);
      });

      // rewind to proves the content of the if def that was true
      this.positionStack[this.positionStack.length - 1] = startIndex;
      return;
    }
  }

  private processIfDefBlock(
    block: Block,
    ifCreator: (
      keyword: Keyword,
      identifier: CIdentifier | null,
      content: CPreprocessorContent
    ) => CIfDef | CIfNotDef
  ): IfDefineBlock {
    this.enqueueToStack();

    const ifDefKeyword = new Keyword(createTokenIndex(block.startToken));
    const endifKeyword = new Keyword(createTokenIndex(block.endToken));

    // rewind so we can capture the identifier
    this.positionStack[this.positionStack.length - 1] =
      this.getTokenIndex(block.startToken) + 1;
    const identifier = this.processCIdentifier();
    if (!identifier) {
      this._issues.push(
        genIssue(SyntaxIssue.EXPECTED_IDENTIFIER, ifDefKeyword)
      );
    }

    const ifDefContent = new CPreprocessorContent(
      createTokenIndex(this.currentToken!, block.splitTokens[0].at(-1))
    );
    const ifDef = ifCreator(ifDefKeyword, identifier ?? null, ifDefContent);

    let cElse: CElse | undefined;

    if (block.splitTokens.length > 1) {
      const elseToken = block.splitTokens[1][0];
      const elseKeyword = new Keyword(createTokenIndex(elseToken));
      const elseContent = new CPreprocessorContent(
        createTokenIndex(elseToken.nextToken!, block.splitTokens[1].at(-1))
      );
      cElse = new CElse(elseKeyword, elseContent);
    }

    const ifDefBlock = new IfDefineBlock(ifDef, endifKeyword, cElse);

    this.mergeStack();
    return ifDefBlock;
  }

  get allAstItems(): ASTBase[] {
    return [...this.dtsIncludes, ...this.nodes];
  }

  resolveInclude(include: Include) {
    if (!include.path.path) {
      return;
    }
    if (include.path.relative) {
      return [
        resolve(dirname(include.uri), include.path.path),
        ...this.incudes.map((c) => resolve(c, include.path.path)),
      ].find((p) => existsSync(p));
    } else {
      return this.incudes
        .map((p) => resolve(p, include.path.path))
        .find((p) => existsSync(p));
    }
  }

  private async processInclude(): Promise<boolean> {
    this.enqueueToStack();

    const startIndex = this.peekIndex();
    let token = this.currentToken;

    if (!token) {
      this.popStack();
      return false;
    }

    let keywordStart = token;
    let keywordEnd: Token | undefined = token;
    if (!validToken(token, LexerToken.C_INCLUDE)) {
      const valid = this.checkConcurrentTokens([
        validateToken(LexerToken.FORWARD_SLASH),
        validateValue("include"),
        validateToken(LexerToken.FORWARD_SLASH),
      ]);

      if (valid.length !== 3) {
        this.popStack();
        return false;
      }

      keywordStart = valid[0];
      keywordEnd = valid.at(-1);
    } else {
      this.moveToNextToken;
    }

    const t = keywordStart;
    const keyword = new Keyword(createTokenIndex(keywordStart, keywordEnd));

    token = this.moveToNextToken;
    const pathStart = token;
    const relative = !!validToken(token, LexerToken.STRING);
    if (!pathStart || (!relative && !validToken(token, LexerToken.LT_SYM))) {
      if (t) this.moveEndOfLine(t);
      this.mergeStack();
      return true;
    }

    let path = "";

    if (relative) {
      path = token?.value ?? "";
    } else {
      while (
        this.currentToken?.pos.line === t.pos.line &&
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        path += this.currentToken?.value ?? "";
        token = this.moveToNextToken;
      }
    }

    const includePath = new IncludePath(
      path,
      relative,
      createTokenIndex(pathStart, token)
    );
    const node = new Include(keyword, includePath);
    this.dtsIncludes.push(node);

    if (!relative) {
      if (
        this.currentToken?.pos.line !== t.pos.line ||
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        this._issues.push(genIssue(SyntaxIssue.GT_SYM, node));
      } else {
        token = this.moveToNextToken;
        includePath.lastToken = token;
      }
    }

    this.mergeStack();

    const endIndex = this.peekIndex();

    const resolvedPath = this.resolveInclude(node);
    node.reolvedPath = resolvedPath;
    if (!resolvedPath) {
      this._issues.push(
        genIssue(
          SyntaxIssue.UNABLE_TO_RESOLVE_INCLUDE,
          node.path,
          DiagnosticSeverity.Warning
        )
      );
    }

    if (resolvedPath) {
      getTokenizedDocumentProvider().requestTokens(resolvedPath, true);
      const fileParser =
        await getCachedCPreprocessorParserProvider().getCPreprocessorParser(
          resolvedPath,
          this.incudes,
          this.macros,
          this.uri
        );

      await fileParser.stable;

      this.macros.clear();
      Array.from(fileParser.macros).forEach(([k, m]) => this.macros.set(k, m));

      if (resolvedPath.endsWith(".h")) {
        this.tokens.splice(startIndex, endIndex - startIndex);
      } else {
        this.tokens.splice(
          startIndex,
          endIndex - startIndex,
          ...fileParser.tokens
        );
      }

      this.nodes.push(...fileParser.nodes);
      this.dtsIncludes.push(...fileParser.dtsIncludes);
    } else {
      this.tokens.splice(startIndex, endIndex - startIndex);
    }

    this.positionStack[this.positionStack.length - 1] = startIndex;
    return true;
  }
}
