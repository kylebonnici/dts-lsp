import { LexerToken, SyntaxIssue, Token } from "./types";
import {
  createTokenIndex,
  genIssue,
  sameLine,
  validateToken,
  validToken,
} from "./helpers";
import { ASTBase } from "./ast/base";
import { Keyword } from "./ast/keyword";
import { Include, IncludePath } from "./ast/cPreprocessors/include";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { BaseParser, Block } from "./baseParser";
import { Parser } from "./parser";
import { getTokenizedDocmentProvider } from "./providers/tokenizedDocument";
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

export class CPreprocessorParser extends BaseParser {
  private commentsParser: CommentsParser;
  public tokens: Token[] = [];
  includes: Include[] = [];
  private nodes: ASTBase[] = [];
  private macroSnapShot: Map<string, CMacro> = new Map<string, CMacro>();

  // tokens must be filtered out from commnets by now
  constructor(
    public readonly uri: string,
    private incudes: string[],
    private common: string[],
    public macros: Map<string, CMacro> = new Map<string, CMacro>()
  ) {
    super();
    this.commentsParser = new CommentsParser(this.uri);
    Array.from(macros).forEach(([k, m]) => this.macroSnapShot.set(k, m));
  }

  includePaths() {
    return this.includes
      .filter(
        (p) =>
          p.path.path.endsWith(".dts") ||
          p.path.path.endsWith(".dtsi") ||
          p.path.path.endsWith(".h")
      )
      .map((include) => this.resolveInclude(include))
      .filter((p) => p) as string[];
  }

  resolveInclude(include: Include) {
    if (include.path.relative) {
      return [
        resolve(dirname(this.uri), include.path.path),
        ...this.common.map((c) => resolve(c, include.path.path)),
      ].find(existsSync);
    } else {
      return this.incudes
        .map((p) => resolve(p, include.path.path))
        .find(existsSync);
    }
  }

  protected reset() {
    super.reset();
    this.includes = [];
    this.macros.clear();
    Array.from(this.macroSnapShot).forEach(([k, m]) => this.macros.set(k, m));
    this.nodes = [];
  }

  public async reparse(): Promise<void> {
    this.reset();
    this.commentsParser.reparse();
    this.parsing = this.parse();
    return this.parsing;
  }

  public async parse() {
    await this.commentsParser.stable;
    this.tokens = this.commentsParser.tokens;

    this.positionStack.push(0);
    if (this.tokens.length === 0) {
      return;
    }

    while (!this.done) {
      await this.lineProcessor();
    }

    if (this.positionStack.length !== 1) {
      throw new Error("Incorrect final stack size");
    }
  }

  protected moveEndOfLine = (line: number, report = true) => {
    if (this.currentToken?.pos.line !== line) {
      return;
    }

    const start = this.currentToken;
    let end: Token | undefined = start;
    while (this.currentToken?.pos.line === line) {
      end = this.moveToNextToken;
    }

    if (report) {
      const node = new ASTBase(createTokenIndex(start, end));
      this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
    }

    return end;
  };

  private async lineProcessor() {
    this.enqueToStack();

    //must be firstToken
    if (
      this.prevToken &&
      this.prevToken.pos.line === this.currentToken?.pos.line
    ) {
      this.moveEndOfLine(this.prevToken.pos.line, false);
      this.mergeStack();
      return;
    }

    const line = this.currentToken?.pos.line;
    const found =
      (await this.processInclude()) ||
      this.processDefinitions() ||
      this.processIfDefBlocks();

    if (line !== undefined) {
      this.moveEndOfLine(line, !!found);
    }

    this.mergeStack();
  }

  private processDefinitions() {
    this.enqueToStack();

    const startIndex = this.peekIndex();
    const token = this.moveToNextToken;
    if (!token || !validToken(token, LexerToken.C_DEFINE)) {
      this.popStack();
      return false;
    }

    const keyword = new Keyword(createTokenIndex(token));

    const definition = this.isFuntionDefinition() || this.processCIdentifier();
    if (!definition) {
      this.issues.push(
        genIssue(SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE, keyword)
      );
      this.mergeStack();
      return true;
    }

    const defninitionContent = this.consumeDefinitionContent();
    let content: CMacroContent | undefined;
    if (defninitionContent.length) {
      content = new CMacroContent(
        createTokenIndex(defninitionContent[0], defninitionContent.at(-1)),
        defninitionContent
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

  private async processInclude(): Promise<boolean> {
    this.enqueToStack();

    const startIndex = this.peekIndex();
    const start = this.moveToNextToken;
    let token = start;
    if (!token || !validToken(token, LexerToken.C_INCLUDE)) {
      this.popStack();
      return false;
    }

    const line = start?.pos.line;
    const keyword = new Keyword(createTokenIndex(token));

    token = this.moveToNextToken;
    const pathStart = token;
    const relative = !!validToken(token, LexerToken.STRING);
    if (!pathStart || (!relative && !validToken(token, LexerToken.LT_SYM))) {
      if (line) this.moveEndOfLine(line);
      this.mergeStack();
      return true;
    }

    let path = "";

    if (relative) {
      path = token?.value ?? "";
    } else {
      while (
        this.currentToken?.pos.line === line &&
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        path += this.currentToken?.value ?? "";
        token = this.moveToNextToken;
      }
    }

    const incudePath = new IncludePath(
      path,
      relative,
      createTokenIndex(pathStart, token)
    );
    const node = new Include(keyword, incudePath);
    node.uri = this.uri;
    this.includes.push(node);

    if (!relative) {
      if (
        this.currentToken?.pos.line !== line ||
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        this.issues.push(genIssue(SyntaxIssue.INCLUDE_CLOSE_PATH, node));
      } else {
        token = this.moveToNextToken;
        incudePath.lastToken = token;
      }
    }

    const resolvedPath = this.resolveInclude(node);
    if (resolvedPath && !resolvedPath.endsWith(".h")) {
      getTokenizedDocmentProvider().requestTokens(resolvedPath, true);
      const childParser = new Parser(
        resolvedPath,
        this.incudes,
        this.common,
        this.macros
      );
      this.childParsers.push(childParser);
      await childParser.stable;
    }

    this.mergeStack();

    const endIndex = this.peekIndex();
    this.tokens.splice(startIndex, endIndex - startIndex);

    this.positionStack[this.positionStack.length - 1] = startIndex;
    return true;
  }

  protected isFuntionDefinition(): FunctionDefinition | undefined {
    this.enqueToStack();
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
        this.issues.push(genIssue(SyntaxIssue.MISSING_COMMA, param));
      } else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
        token = this.moveToNextToken;
      }
      param = this.processCIdentifier() || this.processVariadic();
    }

    const node = new FunctionDefinition(identifier, params);

    if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
      node.lastToken = this.prevToken;
      this.issues.push(
        genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? node)
      );
    } else {
      token = this.moveToNextToken;
      node.lastToken = token;
    }

    node.uri = this.uri;

    this.mergeStack();
    return node;
  }

  private processVariadic() {
    this.enqueToStack();

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
        const prevTokenIndex = this.getTokenIndex(token) - 1;
        return (
          !!token &&
          [LexerToken.C_IFDEF, LexerToken.C_IFNDEF].some((t) =>
            validToken(token, t)
          ) &&
          !sameLine(this.tokens.at(prevTokenIndex), token)
        );
      },
      (token?: Token) => {
        const prevTokenIndex = this.getTokenIndex(token) - 1;
        return (
          !!token &&
          [LexerToken.C_ENDIF].some((t) => validToken(token, t)) &&
          !sameLine(this.tokens.at(prevTokenIndex), token)
        );
      },
      (token?: Token) => {
        const prevTokenIndex = this.getTokenIndex(token) - 1;
        return (
          !!token &&
          [LexerToken.C_ELSE].some((t) => validToken(token, t)) &&
          !sameLine(this.tokens.at(prevTokenIndex), token)
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
    this.enqueToStack();

    const ifDefKeyword = new Keyword(createTokenIndex(block.startToken));
    const endifKeyword = new Keyword(createTokenIndex(block.endToken));

    // rewind so we can capture the identifier
    this.positionStack[this.positionStack.length - 1] =
      this.getTokenIndex(block.startToken) + 1;
    const identifier = this.processCIdentifier();
    if (!identifier) {
      this.issues.push(genIssue(SyntaxIssue.EXPECTED_IDENTIFIER, ifDefKeyword));
    }

    const mainBlockEndIndex = this.getTokenIndex(block.splitTokens[0].at(-1));

    const ifDefContent = new CPreprocessorContent(
      createTokenIndex(this.currentToken!, this.tokens[mainBlockEndIndex])
    );
    const ifDef = ifCreator(ifDefKeyword, identifier ?? null, ifDefContent);

    let cElse: CElse | undefined;

    if (block.splitTokens.length > 1) {
      const elseIndex = this.getTokenIndex(block.splitTokens[1][0]);
      const elseKeyword = new Keyword(createTokenIndex(this.tokens[elseIndex]));
      const elseContent = new CPreprocessorContent(
        createTokenIndex(
          this.tokens[elseIndex + 1],
          block.splitTokens[1].at(-1)
        )
      );
      cElse = new CElse(elseKeyword, elseContent);
    }

    const ifDefBlock = new IfDefineBlock(ifDef, endifKeyword, cElse);

    this.mergeStack();
    return ifDefBlock;
  }

  get allAstItems(): ASTBase[] {
    return [
      ...this.includes,
      ...this.nodes,
      ...this.commentsParser.allAstItems,
    ];
  }
}
