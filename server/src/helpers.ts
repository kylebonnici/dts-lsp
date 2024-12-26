import {
  DiagnosticSeverity,
  DiagnosticTag,
  Position,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import type { ASTBase } from "./ast/base";
import {
  Issue,
  IssueTypes,
  SearchableResult,
  SemanticTokenModifiers,
  SemanticTokenType,
  Token,
  tokenModifiers,
  tokenTypes,
  TokenIndexes,
  LexerToken,
} from "./types";
import { ContextAware } from "./runtimeEvaluator";

export const toRange = (slxBase: ASTBase) => {
  return {
    start: {
      line: slxBase.tokenIndexes?.start?.pos.line ?? 0,
      character: slxBase.tokenIndexes?.start?.pos.col ?? 0,
    },
    end: {
      line: slxBase.tokenIndexes?.end?.pos.line ?? 0,
      character:
        (slxBase.tokenIndexes?.end?.pos.col ?? 0) +
        (slxBase.tokenIndexes?.end?.pos.len ?? 0),
    },
  };
};

export const getTokenTypes = (type: SemanticTokenType) => {
  return tokenTypes.findIndex((t) => t === type);
};

export const getTokenModifiers = (type: SemanticTokenModifiers) => {
  return tokenModifiers.findIndex((t) => t === type);
};

export const positionInBetween = (
  ast: ASTBase,
  file: string,
  position: Position
): boolean => {
  return !!(
    ast.uri === file &&
    ast.tokenIndexes?.start &&
    ast.tokenIndexes?.end &&
    (ast.tokenIndexes.start.pos.line < position.line ||
      (ast.tokenIndexes.start.pos.line === position.line &&
        ast.tokenIndexes.start.pos.col <= position.character)) &&
    (ast.tokenIndexes.end.pos.line > position.line ||
      (ast.tokenIndexes.end.pos.line === position.line &&
        ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len >=
          position.character))
  );
};

export const isLastTokenOnLine = (
  tokens: Token[] | undefined,
  ast: ASTBase,
  position: Position
) => {
  if (!tokens) {
    return false;
  }
  const lineTokens = tokens.filter((t) => t.pos.line === position.line);
  const lastLineToken = lineTokens.at(-1);
  if (lastLineToken && lastLineToken.pos.col >= position.character)
    return false; // we should have matched positionInBetween
  return ast.tokenIndexes?.end === lastLineToken;
};

export const getDeepestAstNodeInBetween = (
  ast: ASTBase,
  previousFiles: string[],
  file: string,
  position: Position
) => {
  let deepestAstNode: ASTBase | undefined = ast;
  let next: ASTBase | undefined = ast;
  while (next) {
    deepestAstNode = next;
    next = [...deepestAstNode.children]
      .reverse()
      .find((c) => positionInBetween(c, file, position));
  }
  return deepestAstNode;
};

export const genIssue = <T extends IssueTypes>(
  issue: T | T[],
  slxBase: ASTBase,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  linkedTo: ASTBase[] = [],
  tags: DiagnosticTag[] | undefined = undefined,
  templateStrings: string[] = []
): Issue<T> => ({
  issues: Array.isArray(issue) ? issue : [issue],
  astElement: slxBase,
  severity,
  linkedTo,
  tags,
  templateStrings,
});

export const sortAstForScope = (ast: ASTBase[], fileOrder: string[]) => {
  const arrayCopy = [...ast];
  return arrayCopy.sort((a, b) => {
    const aFileIndex = fileOrder.findIndex((f) => a.uri);
    const bFileIndex = fileOrder.findIndex((f) => b.uri);

    if (aFileIndex !== bFileIndex) {
      return aFileIndex - bFileIndex;
    }

    if (!a.tokenIndexes?.end || !b.tokenIndexes?.end) {
      throw new Error("Must have token indexes");
    }

    if (a.tokenIndexes.end.pos.line !== b.tokenIndexes.end.pos.line) {
      return a.tokenIndexes.end.pos.line - b.tokenIndexes.end.pos.line;
    }

    return a.tokenIndexes.end.pos.col - b.tokenIndexes.end.pos.col;
  });
};

export async function nodeFinder<T>(
  location: TextDocumentPositionParams,
  contexts: ContextAware[],
  action: (
    result: SearchableResult | undefined,
    inScope: (ast: ASTBase) => boolean
  ) => T[],
  preferredContext?: number
): Promise<T[]> {
  const uri = location.textDocument.uri.replace("file://", "");

  const contextMeta = await findContext(contexts, uri, preferredContext);

  if (!contextMeta) return [];

  console.time("search");
  const orderedFiles = await contextMeta.context.getOrderedContextFiles();
  const runtime = await contextMeta.context.getRuntime();
  const locationMeta = runtime.getDeepestAstNode(
    orderedFiles.slice(0, orderedFiles.indexOf(uri)),
    uri,
    location.position
  );
  console.timeEnd("search");

  const inScope = (ast: ASTBase) => {
    const position = location.position;
    if (ast.uri === uri) {
      return !!(
        ast.tokenIndexes?.end &&
        (ast.tokenIndexes.end.pos.line < position.line ||
          (ast.tokenIndexes.end.pos.line === position.line &&
            ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len <=
              position.character))
      );
    }

    const validFiles = orderedFiles.slice(0, orderedFiles.indexOf(uri) + 1);

    return validFiles.some((uri) => uri === ast.uri);
  };

  return action(locationMeta, inScope);
}

export function createTokenIndex(start: Token, end?: Token): TokenIndexes {
  return { start, end: end ?? start };
}

export const validToken = (token: Token | undefined, expected: LexerToken) =>
  token?.tokens.some((t) => t === expected);

export const validateValue = (expected: string) => (token: Token | undefined) =>
  token?.value && expected === token.value
    ? "yes"
    : validateValueStartsWith(expected)(token);
export const validateToken =
  (expected: LexerToken) => (token: Token | undefined) =>
    token?.tokens.some((t) => t === expected) ? "yes" : "no";
export const validateValueStartsWith =
  (expected: string) => (token: Token | undefined) =>
    token?.value && expected.startsWith(token.value) ? "partial" : "no";

export const sameLine = (tokenA?: Token, tokenB?: Token) => {
  return !!tokenA && !!tokenB && tokenA.pos.line === tokenB.pos.line;
};

export const adjacentTokens = (tokenA?: Token, tokenB?: Token) => {
  return (
    !!tokenA &&
    !!tokenB &&
    sameLine(tokenA, tokenB) &&
    tokenA.pos.col + tokenA.pos.len === tokenB.pos.col
  );
};

export const resolveContextFiles = async (contextAware: ContextAware[]) => {
  return Promise.all(
    contextAware.map(async (c, index) => ({
      index,
      context: c,
      files: await c.getOrderedContextFiles(),
    }))
  );
};

export const findContext = async (
  contextAware: ContextAware[],
  uri: string,
  preferredContext = 0
) => {
  const contextFiles = await resolveContextFiles(contextAware);

  return contextFiles
    .sort((a) => (a.index === preferredContext ? -1 : 0))
    .find((c) => c.files.some((p) => p === uri));
};
