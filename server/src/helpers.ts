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

export const positionSameLineAndNotAfter = (
  ast: ASTBase,
  file: string,
  position: Position
): boolean => {
  return !!(
    ast.uri === file &&
    ast.lastToken.value !== ";" &&
    ast.tokenIndexes?.start &&
    ast.tokenIndexes?.end &&
    (ast.tokenIndexes.start.pos.line === position.line ||
      ast.tokenIndexes.end.pos.line === position.line) &&
    position.character >=
      ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len
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

export const getAstOnLine = (
  ast: ASTBase,
  file: string,
  position: Position
) => {
  const children = ast.children;
  let deepestAstNode: ASTBase | undefined = ast;

  deepestAstNode = children.find((c) =>
    positionSameLineAndNotAfter(ast, file, position)
  );

  return deepestAstNode;
};

export const getDeepestAstNodeInBetween = (
  ast: ASTBase,
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

export const sortAstForScope = <T extends ASTBase>(ast: T[]) => {
  const arrayCopy = [...ast];
  return arrayCopy.sort((a, b) => {
    if (a.sortKey === undefined || b.sortKey === undefined) {
      throw new Error("Sort keys must be set");
    }

    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
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
  const runtime = await contextMeta.context.getRuntime();
  const locationMeta = runtime.getDeepestAstNode(uri, location.position);
  const sortKey = locationMeta?.ast?.sortKey;
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

    return sortKey !== undefined && ast.sortKey <= sortKey;
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
      files: (await c.getOrderedParsers()).map((p) => p.uri),
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

export const findContexts = async (
  contextAware: ContextAware[],
  uri: string
) => {
  const contextFiles = await resolveContextFiles(contextAware);
  return contextFiles.filter((c) => c.files.some((p) => p === uri));
};
