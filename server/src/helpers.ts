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
  TextEdit,
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
  MacroRegistryItem,
} from "./types";
import { ContextAware } from "./runtimeEvaluator";
import url from "url";

export const toRangeWithTokenIndex = (
  start?: Token,
  end?: Token,
  incusiveStart = true,
  incusiveEnd = true
) => {
  return {
    start: {
      line: start?.pos.line ?? 0,
      character: incusiveStart
        ? start?.pos.col ?? 0
        : (start?.pos.col ?? 0) + (start?.pos.len ?? 0),
    },
    end: {
      line: end?.pos.line ?? 0,
      character: incusiveEnd
        ? (end?.pos.col ?? 0) + (end?.pos.len ?? 0)
        : end?.pos.col ?? 0,
    },
  };
};

export const tokensToString = (tokens: Token[]) => {
  return tokens
    .map((p, i) => {
      let v = p.value;
      if (p.pos.line === tokens.at(i + 1)?.pos.line) {
        return v.padEnd(tokens[i + 1].pos.col - p.pos.col, " ");
      } else {
        return (v += "\n");
      }
    })
    .join("");
};

export const toRange = (slxBase: ASTBase) => {
  return toRangeWithTokenIndex(
    slxBase.tokenIndexes.start,
    slxBase.tokenIndexes.end
  );
};

let indentString = "\t";

export const setIndentString = (indent: string) => {
  indentString = indent;
};

export const getIndentString = () => {
  return indentString;
};

export const getTokenTypes = (type: SemanticTokenType) => {
  return tokenTypes.findIndex((t) => t === type);
};

export const getTokenModifiers = (type: SemanticTokenModifiers) => {
  return tokenModifiers.findIndex((t) => t === type);
};

export const positionAfter = (
  token: Token,
  file: string,
  position: Position
): boolean => {
  if (token.uri !== file) return false;

  if (position.line < token.pos.line) return false;

  if (position.line > token.pos.line) return true;

  return position.character > token.pos.col + token.pos.len;
};

export const positionBefore = (
  token: Token,
  file: string,
  position: Position
): boolean => {
  if (token.uri !== file) return false;

  if (position.line < token.pos.line) return true;

  if (position.line > token.pos.line) return false;

  return position.character < token.pos.col;
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

export const getDeepestAstNodeAfter = (
  ast: ASTBase,
  file: string,
  position: Position
) => {
  let deepestAstNode: ASTBase | undefined = ast;
  let next: ASTBase | undefined = ast;
  while (next) {
    deepestAstNode = next;
    next = [...deepestAstNode.children].find((c) =>
      positionBefore(c.lastToken, file, position)
    );
  }
  return deepestAstNode === ast ? undefined : deepestAstNode;
};

export const getDeepestAstNodeBefore = (
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
      .find((c) => positionAfter(c.firstToken, file, position));
  }
  return deepestAstNode === ast ? undefined : deepestAstNode;
};

export const genIssue = <T extends IssueTypes>(
  issue: T | T[],
  slxBase: ASTBase,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  linkedTo: ASTBase[] = [],
  tags: DiagnosticTag[] | undefined = undefined,
  templateStrings: string[] = [],
  edit?: TextEdit,
  codeActionTitle?: string
): Issue<T> => ({
  issues: Array.isArray(issue) ? issue : [issue],
  astElement: slxBase,
  severity,
  linkedTo,
  tags,
  templateStrings,
  edit,
  codeActionTitle,
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
  ) => T[] | Promise<T[]>,
  activeContext?: ContextAware,
  preferredContext?: string | number
): Promise<T[]> {
  const uri = fileURLToPath(location.textDocument.uri);

  const contextMeta = findContext(
    contexts,
    uri,
    activeContext,
    preferredContext
  );

  if (!contextMeta) return [];

  console.time("search");
  const runtime = await contextMeta.context.getRuntime();
  const locationMeta = runtime.getDeepestAstNode(uri, location.position);
  const sortKey = locationMeta?.ast?.firstToken.sortKey;
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
  return (
    !!tokenA &&
    !!tokenB &&
    tokenA.pos.line === tokenB.pos.line &&
    tokenA.uri === tokenB.uri
  );
};

export const adjacentTokens = (tokenA?: Token, tokenB?: Token) => {
  return (
    !!tokenA &&
    !!tokenB &&
    sameLine(tokenA, tokenB) &&
    tokenA.pos.col + tokenA.pos.len === tokenB.pos.col
  );
};

export const resolveContextFiles = (contextAware: ContextAware[]) => {
  return contextAware.map((c, index) => ({
    index,
    context: c,
    files: c.getContextFiles(),
  }));
};

export const findContext = (
  contextAware: ContextAware[],
  uri: string,
  activeContext?: ContextAware,
  preferredContext?: string | number
) => {
  if (activeContext?.getContextFiles().find((f) => f === uri))
    return { context: activeContext };

  const contextFiles = resolveContextFiles(contextAware);

  return contextFiles
    .sort((a) => (a.context.name === preferredContext ? -1 : 0))
    .find((c) => c.files.some((p) => p === uri));
};

export const findContexts = (contextAware: ContextAware[], uri: string) => {
  const contextFiles = resolveContextFiles(contextAware);
  return contextFiles.filter((c) => c.files.some((p) => p === uri));
};

export const parseMacros = (line: string) => {
  // Regular expressions to match macro definitions
  const macroRegex = /^(\w+)\s+(.+)$/;
  const funcMacroRegex = /^(\w+)\(([^)]*)\)\s+(.+)$/;
  const variadicMacroRegex = /^(\w+)\(([^)]*),\s*\.\.\.\)\s+(.+)$/;

  let match;
  if ((match = variadicMacroRegex.exec(line))) {
    const [, , params, body] = match;
    const paramList = params.split(",").map((p) => p.trim());
    return (...args: string[]) => {
      let expanded = body;
      paramList.forEach((param, index) => {
        const regex = new RegExp(`\\b${param}\\b`, "g");
        expanded = expanded.replace(regex, args[index]);
      });
      expanded = expanded.replace(
        /__VA_ARGS__/g,
        args.slice(paramList.length).join(", ")
      );
      return expanded;
    };
  } else if ((match = funcMacroRegex.exec(line))) {
    const [, , params, body] = match;
    const paramList = params.split(",").map((p) => p.trim());
    return (...args: string[]) => {
      let expanded = body;
      paramList.forEach((param, index) => {
        const regex = new RegExp(`\\b${param}\\b`, "g");
        expanded = expanded.replace(regex, args[index]);
      });
      return expanded;
    };
  } else if ((match = macroRegex.exec(line))) {
    const [, , body] = match;
    return body.trim();
  }
};

export const expandMacros = (
  code: string,
  macrosResolvers: Map<string, MacroRegistryItem>
): string => {
  const handleTokenConcatenation = (code: string): string => {
    return code.replace(
      /(\w+)\s*##\s*(\w+)/g,
      (match, left, right) => left + right
    );
  };
  const handleStringification = (code: string): string => {
    return code.replace(/#(\w+)/g, (_, param) => `"${param}"`);
  };
  let expandedCode = code;
  let prevCode;
  do {
    prevCode = expandedCode;
    expandedCode = handleTokenConcatenation(prevCode); // Handle ## operator
    expandedCode = handleStringification(expandedCode); // Handle # operator
    expandedCode = expandedCode.replace(
      /\b(\w+)\(([^)]*)\)|\b(\w+)\b/g,
      (match, func, args, simple) => {
        if (func === "defined") {
          const argList = args.split(",").map((a: string) => a.trim());
          return argList[0]
            ? (macrosResolvers.get(argList[0])?.resolver as string)
            : argList;
        } else if (
          func &&
          typeof macrosResolvers.get(func)?.resolver === "function"
        ) {
          const argList = args.split(",").map((a: string) => a.trim());
          return (
            macrosResolvers.get(func)?.resolver as (...args: string[]) => string
          )(...argList);
        } else if (
          simple &&
          typeof macrosResolvers.get(simple)?.resolver === "string"
        ) {
          return macrosResolvers.get(simple)?.resolver as string;
        }
        return match;
      }
    );
  } while (expandedCode !== prevCode);
  return expandedCode;
};

export const pathToFileURL = (path: string) => {
  return url.pathToFileURL(path).toString();
};

export const fileURLToPath = (fileUrl: string) => {
  return url.fileURLToPath(fileUrl);
};

export const isPathEqual = (pathA: string, pathB: string) => {
  return pathA === pathB;
};
