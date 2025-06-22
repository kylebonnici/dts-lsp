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
  Diagnostic,
  DiagnosticSeverity,
  DiagnosticTag,
  Position,
  TextDocumentPositionParams,
  TextEdit,
} from "vscode-languageserver";
import type { ASTBase } from "./ast/base";
import {
  Issue,
  SearchableResult,
  SemanticTokenModifiers,
  SemanticTokenType,
  Token,
  tokenModifiers,
  tokenTypes,
  TokenIndexes,
  LexerToken,
  MacroRegistryItem,
  ContextId,
  SyntaxIssue,
  ContextIssues,
  StandardTypeIssue,
  CodeActionDiagnosticData,
  FileDiagnostic,
  RangeMapping,
} from "./types";
import { ContextAware } from "./runtimeEvaluator";
import url from "url";
import { createHash } from "crypto";
import { ResolvedContext } from "./types/index";
import { normalize } from "path";
import { CMacroCall } from "./ast/cPreprocessors/functionCall";
import { TextDocument } from "vscode-languageserver-textdocument";

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
  if (!isPathEqual(token.uri, file)) return false;

  if (position.line < token.pos.line) return false;

  if (position.line > token.pos.line) return true;

  return position.character > token.pos.colEnd;
};

export const positionBefore = (
  token: Token,
  file: string,
  position: Position
): boolean => {
  if (!isPathEqual(token.uri, file)) return false;

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
    isPathEqual(ast.uri, file) &&
    ast.tokenIndexes?.start &&
    ast.tokenIndexes?.end &&
    (ast.tokenIndexes.start.pos.line < position.line ||
      (ast.tokenIndexes.start.pos.line === position.line &&
        ast.tokenIndexes.start.pos.col <= position.character)) &&
    (ast.tokenIndexes.end.pos.line > position.line ||
      (ast.tokenIndexes.end.pos.line === position.line &&
        ast.tokenIndexes.end.pos.colEnd >= position.character))
  );
};

export const positionSameLineAndNotAfter = (
  ast: ASTBase,
  file: string,
  position: Position
): boolean => {
  return !!(
    isPathEqual(ast.uri, file) &&
    ast.lastToken.value !== ";" &&
    ast.tokenIndexes?.start &&
    ast.tokenIndexes?.end &&
    (ast.tokenIndexes.start.pos.line === position.line ||
      ast.tokenIndexes.end.pos.line === position.line) &&
    position.character >= ast.tokenIndexes.end.pos.colEnd
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

export const genSyntaxDiagnostic = (
  issues: SyntaxIssue | SyntaxIssue[],
  slxBase: ASTBase,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  linkedTo: ASTBase[] = [],
  tags: DiagnosticTag[] | undefined = undefined,
  templateStrings: string[] = [],
  edit?: TextEdit,
  codeActionTitle?: string
): FileDiagnostic => {
  const issue: Issue<SyntaxIssue> = {
    issues: Array.isArray(issues) ? issues : [issues],
    astElement: slxBase,
    severity,
    linkedTo,
    tags,
    templateStrings,
    edit,
    codeActionTitle,
  };

  let diagnostic: Diagnostic;

  const action = () => {
    diagnostic ??= {
      severity: issue.severity,
      range: toRange(issue.astElement),
      message: issue.issues
        ? issue.issues.map(syntaxIssueToMessage).join(" or ")
        : "",
      source: "devicetree",
      tags: issue.tags,
      data: {
        firstToken: {
          pos: issue.astElement.firstToken.pos,
          tokens: issue.astElement.firstToken.tokens,
          value: issue.astElement.firstToken.value,
        },
        lastToken: {
          pos: issue.astElement.lastToken.pos,
          tokens: issue.astElement.lastToken.tokens,
          value: issue.astElement.lastToken.value,
        },
        issues: {
          type: "SyntaxIssue",
          items: issue.issues,
          edit: issue.edit,
          codeActionTitle: issue.codeActionTitle,
        },
      } satisfies CodeActionDiagnosticData,
    };
    return diagnostic;
  };

  issue.astElement.issues.push(action);

  return {
    raw: issue,
    diagnostic: action,
  };
};

export const genContextDiagnostic = (
  issues: ContextIssues | ContextIssues[],
  slxBase: ASTBase,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  linkedTo: ASTBase[] = [],
  tags: DiagnosticTag[] | undefined = undefined,
  templateStrings: string[] = [],
  edit?: TextEdit,
  codeActionTitle?: string
): FileDiagnostic => {
  const issue: Issue<ContextIssues> = {
    issues: Array.isArray(issues) ? issues : [issues],
    astElement: slxBase,
    severity,
    linkedTo,
    tags,
    templateStrings,
    edit,
    codeActionTitle,
  };

  let diagnostic: Diagnostic;

  const action = () => {
    diagnostic ??= {
      severity: issue.severity,
      range: toRange(issue.astElement),
      message: contextIssuesToMessage(issue),
      source: "devicetree",
      tags: issue.tags,
      relatedInformation: [
        ...issue.linkedTo.map((element) => ({
          message: issue.issues.map(contextIssuesToLinkedMessage).join(" or "),
          location: {
            uri: pathToFileURL(element.uri!),
            range: toRange(element),
          },
        })),
      ],
    };
    return diagnostic;
  };

  issue.astElement.issues.push(action);

  return {
    raw: issue,
    diagnostic: action,
  };
};

export const genStandardTypeDiagnostic = (
  issues: StandardTypeIssue | StandardTypeIssue[],
  slxBase: ASTBase,
  severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  linkedTo: ASTBase[] = [],
  tags: DiagnosticTag[] | undefined = undefined,
  templateStrings: string[] = [],
  edit?: TextEdit,
  codeActionTitle?: string
): FileDiagnostic => {
  const issue: Issue<StandardTypeIssue> = {
    issues: Array.isArray(issues) ? issues : [issues],
    astElement: slxBase,
    severity,
    linkedTo,
    tags,
    templateStrings,
    edit,
    codeActionTitle,
  };

  let diagnostic: Diagnostic;

  const action = () => {
    diagnostic ??= {
      severity: issue.severity,
      range: toRange(issue.astElement),
      message: standardTypeIssueIssuesToMessage(issue),
      relatedInformation: [
        ...issue.linkedTo.map((element) => ({
          message: issue.issues.map(standardTypeToLinkedMessage).join(" or "),
          location: {
            uri: pathToFileURL(element.uri!),
            range: toRange(element),
          },
        })),
      ],
      source: "devicetree",
      tags: issue.tags,
      data: {
        firstToken: {
          pos: issue.astElement.firstToken.pos,
          tokens: issue.astElement.firstToken.tokens,
          value: issue.astElement.firstToken.value,
        },
        lastToken: {
          pos: issue.astElement.lastToken.pos,
          tokens: issue.astElement.lastToken.tokens,
          value: issue.astElement.lastToken.value,
        },
        issues: {
          type: "StandardTypeIssue",
          items: issue.issues,
          edit: issue.edit,
          codeActionTitle: issue.codeActionTitle,
        },
      } satisfies CodeActionDiagnosticData,
    };
    return diagnostic;
  };

  issue.astElement.issues.push(action);

  return {
    raw: issue,
    diagnostic: action,
  };
};

export const sortAstForScope = <T extends ASTBase>(
  ast: T[],
  context: ContextAware
) => {
  const arrayCopy = [...ast];
  return arrayCopy.sort((a, b) => {
    const aSortKey = context.getSortKey(a);
    const bSortKey = context.getSortKey(b);
    if (aSortKey === undefined || bSortKey === undefined) {
      throw new Error("Sort keys must be set");
    }

    if (aSortKey !== bSortKey) {
      return aSortKey - bSortKey;
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
  context: ContextAware | undefined,
  action: (
    result: SearchableResult | undefined,
    inScope: (ast: ASTBase) => boolean
  ) => T[] | Promise<T[]>
): Promise<T[]> {
  const uri = fileURLToPath(location.textDocument.uri);

  if (!context) {
    return [];
  }

  console.time("search");
  const runtime = await context.getRuntime();
  const locationMeta = runtime.getDeepestAstNode(uri, location.position);
  const sortKey = context.getSortKey(locationMeta?.ast);
  console.timeEnd("search");

  const inScope = (ast: ASTBase) => {
    const position = location.position;
    if (isPathEqual(ast.uri, uri)) {
      return !!(
        ast.tokenIndexes?.end &&
        (ast.tokenIndexes.end.pos.line < position.line ||
          (ast.tokenIndexes.end.pos.line === position.line &&
            ast.tokenIndexes.end.pos.colEnd <= position.character))
      );
    }

    return sortKey !== undefined && (context.getSortKey(ast) ?? -1) <= sortKey;
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
    isPathEqual(tokenA.uri, tokenB.uri)
  );
};

export const adjacentTokens = (tokenA?: Token, tokenB?: Token) => {
  return (
    !!tokenA &&
    !!tokenB &&
    sameLine(tokenA, tokenB) &&
    tokenA.pos.colEnd === tokenB.pos.col
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
  id: ContextId,
  activeContext?: ContextAware,
  preferredContext?: string | number
) => {
  if ("id" in id) {
    const context = contextAware?.find((f) => f.id === id.id);
    if (context) {
      return context;
    }
    return;
  }

  if ("name" in id) {
    const context = contextAware?.find((f) => f.ctxNames.includes(id.name));
    if (context) {
      return context;
    }
    return;
  }

  if (activeContext?.getContextFiles().find((f) => isPathEqual(f, id.uri)))
    return activeContext;

  const contextFiles = resolveContextFiles(contextAware);

  return contextFiles
    .sort((a) => (a.context.id === preferredContext ? -1 : 0))
    .find((c) => c.files.some((p) => isPathEqual(p, id.uri)))?.context;
};

export const findContexts = (contextAware: ContextAware[], uri: string) => {
  const contextFiles = resolveContextFiles(contextAware);
  return contextFiles
    .filter((c) => c.files.some((p) => isPathEqual(p, uri)))
    .map((c) => c.context);
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
  return normalizePath(url.fileURLToPath(fileUrl));
};

export const isPathEqual = (
  pathA: string | undefined,
  pathB: string | undefined
) => {
  if (!pathA || !pathB) return false;

  return pathA === pathB;
};

export const normalizePath = (p: string) =>
  normalize(process.platform === "win32" ? p.toLowerCase() : p);

export const generateContextId = (ctx: ResolvedContext) => {
  return createHash("sha256")
    .update(
      [
        normalizePath(ctx.dtsFile),
        ...ctx.includePaths.map(normalizePath),
        ...ctx.overlays.map(normalizePath),
        ctx.bindingType,
        ...ctx.zephyrBindings.map(normalizePath),
        ...ctx.deviceOrgBindingsMetaSchema.map(normalizePath),
        ...ctx.deviceOrgTreeBindings.map(normalizePath),
      ].join(":")
    )
    .digest("hex");
};

export const syntaxIssueToMessage = (issue: SyntaxIssue) => {
  switch (issue) {
    case SyntaxIssue.VALUE:
      return "Expected value";
    case SyntaxIssue.END_STATEMENT:
      return "Expected ';'";
    case SyntaxIssue.CURLY_OPEN:
      return "Expected '{'";
    case SyntaxIssue.CURLY_CLOSE:
      return "Expected '}'";
    case SyntaxIssue.OPEN_SQUARE:
      return "Expected '['";
    case SyntaxIssue.SQUARE_CLOSE:
      return "Expected ']'";
    case SyntaxIssue.GT_SYM:
      return "Expected '>'";
    case SyntaxIssue.LT_SYM:
      return "Expected '<'";
    case SyntaxIssue.DOUBLE_QUOTE:
      return "Expected '\"'";
    case SyntaxIssue.SINGLE_QUOTE:
      return 'Expected "\'"\\';
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
      return "Missing ':'";
    case SyntaxIssue.MISSING_FORWARD_SLASH_END:
      return "Missing '/'";
    case SyntaxIssue.MISSING_ROUND_CLOSE:
      return 'Expected ")"';
    case SyntaxIssue.MISSING_COMMA:
      return 'Missing ","';
    case SyntaxIssue.PROPERTY_NAME:
      return "Expected property name";
    case SyntaxIssue.NODE_NAME:
      return "Expected node name";
    case SyntaxIssue.NODE_ADDRESS:
      return "Expected node address";
    case SyntaxIssue.NODE_PATH:
      return "Expected node path";
    case SyntaxIssue.NODE_REF:
      return "Expected node reference";
    case SyntaxIssue.ROOT_NODE_NAME:
      return "Expected root node name";
    case SyntaxIssue.BYTESTRING:
      return "Expected bytestring";
    case SyntaxIssue.BYTESTRING_EVEN:
      return "Expected two digits for each byte in bytestring";
    case SyntaxIssue.BYTESTRING_HEX:
      return "Hex values are not allowed";
    case SyntaxIssue.LABEL_NAME:
      return "Expected label name";
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
      return "Expected '/' at the start of a node path";
    case SyntaxIssue.NO_STATEMENT:
      return "Found ';' without a statement";
    case SyntaxIssue.DELETE_INCOMPLETE:
      return "Did you mean /delete-node/ or /delete-property/?";
    case SyntaxIssue.DELETE_NODE_INCOMPLETE:
      return "Did you mean /delete-node/?";
    case SyntaxIssue.DELETE_PROPERTY_INCOMPLETE:
      return "Did you mean /delete-property/?";
    case SyntaxIssue.UNKNOWN:
      return "Unknown syntax";
    case SyntaxIssue.EXPECTED_EXPRESSION:
      return "Expected expression";
    case SyntaxIssue.EXPECTED_IDENTIFIER:
      return "Expected macro identifier";
    case SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE:
      return "Expected macro identifier or function like macro";
    case SyntaxIssue.WHITE_SPACE:
      return "White space is not allowed";
    case SyntaxIssue.PROPERTY_MUST_BE_IN_NODE:
      return "Properties can only be defined in a node";
    case SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE:
      return "Properties can only be deleted inside a node";
    case SyntaxIssue.UNABLE_TO_RESOLVE_INCLUDE:
      return "Unable to resolve include";
    case SyntaxIssue.EXPECTED_START_ADDRESS:
      return "Expected start address";
    case SyntaxIssue.EXPECTED_END_ADDRESS:
      return "Expected end address";
    case SyntaxIssue.EXPECTED_BITS_SIZE:
    case SyntaxIssue.INVALID_BITS_SIZE:
      return "Expected 8|16|32|64";
    case SyntaxIssue.UNKNOWN_MACRO:
      return "Unknown macro name";
    case SyntaxIssue.EXPECTED_FUNCTION_LIKE:
      return "Expected function like macro";
    case SyntaxIssue.MACRO_EXPECTS_LESS_PARAMS:
      return "Macro expects less arguments";
    case SyntaxIssue.MACRO_EXPECTS_MORE_PARAMS:
      return "Macro expects more arguments";
    case SyntaxIssue.MISSING_ENDIF:
      return "Missing #ENDIF";
    case SyntaxIssue.UNUSED_BLOCK:
      return "Block Unused";
    case SyntaxIssue.BITS_NON_OFFICIAL_SYNTAX:
      return "This syntax is not officially part of the DTS V0.4 standard";
  }
};

export const contextIssuesToMessage = (issue: Issue<ContextIssues>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case ContextIssues.DUPLICATE_PROPERTY_NAME:
          return `Property "${issue.templateStrings[0]}" is replaced by a later definition`;
        case ContextIssues.PROPERTY_DOES_NOT_EXIST:
          return "Cannot delete a property before it has been defined";
        case ContextIssues.DUPLICATE_NODE_NAME:
          return "Node name already defined";
        case ContextIssues.NODE_DOES_NOT_EXIST:
          return "Cannot delete a node before it has been defined";
        case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
          return `No node with that reference "${issue.templateStrings[0]}" has been defined`;
        case ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH:
          return `No node with name "${issue.templateStrings[0]}" could be found in "/${issue.templateStrings[1]}".`;
        case ContextIssues.LABEL_ALREADY_IN_USE:
          return `Label name "${issue.templateStrings[0]}" already defined`;
        case ContextIssues.DELETE_PROPERTY:
          return `Property "${issue.templateStrings[0]}" was deleted`;
        case ContextIssues.DELETE_NODE:
          return `Node "${issue.templateStrings[0]}" was deleted`;
        case ContextIssues.MISSING_NODE:
          return `The following node "${issue.templateStrings[1]}" shall be present in "${issue.templateStrings[0]}" node.`;
      }
    })
    .join(" or ");
};

export const contextIssuesToLinkedMessage = (issue: ContextIssues) => {
  switch (issue) {
    case ContextIssues.DUPLICATE_PROPERTY_NAME:
      return "Property name already defined.";
    case ContextIssues.DUPLICATE_NODE_NAME:
      return "Defined here";
    case ContextIssues.LABEL_ALREADY_IN_USE:
      return "Defined here";
    case ContextIssues.DELETE_NODE:
    case ContextIssues.DELETE_PROPERTY:
      return "Deleted here";
    case ContextIssues.MISSING_NODE:
      return "Node";
    default:
      return "TODO";
  }
};

export const standardTypeIssueIssuesToMessage = (
  issue: Issue<StandardTypeIssue>
) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case StandardTypeIssue.EXPECTED_ENUM:
          return `Only these value are allowed ${issue.templateStrings[0]}`;
        case StandardTypeIssue.EXPECTED_EMPTY:
          return `INTRO should be empty`;
        case StandardTypeIssue.EXPECTED_ONE:
          return `INTRO can only be assigned one value`;
        case StandardTypeIssue.EXPECTED_U32:
          return `INTRO should be assigned a U32`;
        case StandardTypeIssue.EXPECTED_U64:
          return `INTRO should be assigned a U64`;
        case StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY:
          return `INTRO should be assigned a 'property encoded array'`;
        case StandardTypeIssue.EXPECTED_STRING:
          return `INTRO should be assigned a string`;
        case StandardTypeIssue.EXPECTED_STRINGLIST:
          return `INTRO should be assigned a string list`;
        case StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH:
          return `INTRO expects ${issue.templateStrings[1]} values`;
        case StandardTypeIssue.REQUIRED:
          return `INTRO is required`;
        case StandardTypeIssue.OMITTED:
          return `INTRO should be omitted`;
        case StandardTypeIssue.PROPERTY_NOT_ALLOWED:
          return `INTRO name is not permitted under this node`;
        case StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_ADDRESS_VALUE:
          return `INTRO address value must match node address`;
        case StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU:
          return `INTRO should be 'cpu'`;
        case StandardTypeIssue.EXPECTED_DEVICE_TYPE_MEMORY:
          return `INTRO should be 'memory'`;
        case StandardTypeIssue.DEPRECATED:
          return `INTRO is deprecated and should not be used'`;
        case StandardTypeIssue.IGNORED:
          return `INTRO ${issue.templateStrings[1]}'`;
        case StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE:
          return `INTRO value must be unique in the entire Devicetree`;
        case StandardTypeIssue.CELL_MISS_MATCH:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE:
          return `INTRO requires property "${issue.templateStrings[1]}" in node path "${issue.templateStrings[2]}"`;
        case StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND:
          return `Unable to resolve interrupt parent node`;
        case StandardTypeIssue.MAP_ENTRY_INCOMPLETE:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.NODE_DISABLED:
          return "Node is disabled";
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE:
          return `Unable to resolve handle`;
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PATH:
          return `Unable to find "${issue.templateStrings[0]}" in ${issue.templateStrings[1]}`;
        case StandardTypeIssue.EXPECTED_VALUE:
          return issue.templateStrings[0];
        case StandardTypeIssue.DEVICETREE_ORG_BINDINGS:
          return issue.templateStrings[0];
        case StandardTypeIssue.NODE_LOCATION:
          return issue.templateStrings[0];
        case StandardTypeIssue.INVALID_VALUE:
          return issue.templateStrings[0];
        case StandardTypeIssue.EXCEEDS_MAPPING_ADDRESS:
          return `INTRO exceeds address space avalable for this mapping. The range ends at ${issue.templateStrings[2]}, the node ends at ${issue.templateStrings[1]}`;
        case StandardTypeIssue.DUPLICATE_MAP_ENTRY:
          return `Map entry overlaps with others entries`;
        case StandardTypeIssue.NO_NEXUS_MAP_MATCH:
          return `Unable to match to a nexus map entry`;
      }
    })
    .join(" or ")
    .replace("INTRO", `Property "${issue.templateStrings[0]}"`)
    .replaceAll("INTRO ", "");
};

export const standardTypeToLinkedMessage = (issue: StandardTypeIssue) => {
  switch (issue) {
    case StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE:
    case StandardTypeIssue.REQUIRED:
      return `Node`;
    case StandardTypeIssue.IGNORED:
      return "Ignored reason";
    case StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE:
      return "Conflicting properties";
    case StandardTypeIssue.EXPECTED_ONE:
      return "Additional value";
    case StandardTypeIssue.NODE_DISABLED:
      return "Disabled by";
    case StandardTypeIssue.EXCEEDS_MAPPING_ADDRESS:
      return "Mapping range";
    case StandardTypeIssue.DUPLICATE_MAP_ENTRY:
      return `Map entry`;
    case StandardTypeIssue.NO_NEXUS_MAP_MATCH:
      return `Nexus map entries`;
    default:
      return `TODO`;
  }
};

export const compareWords = (a: number[], b: number[]): number => {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const ai = a[a.length - n + i] ?? 0;
    const bi = b[b.length - n + i] ?? 0;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
  }
  return 0;
};

export const addWords = (a: number[], b: number[]): number[] => {
  const n = Math.max(a.length, b.length);
  const result: number[] = new Array(n).fill(0);
  let carry = 0;
  for (let i = 0; i < n; i++) {
    const ai = a[a.length - 1 - i] ?? 0;
    const bi = b[b.length - 1 - i] ?? 0;
    const sum = ai + bi + carry;
    result[n - 1 - i] = sum >>> 0;
    carry = sum > 0xffffffff ? 1 : 0;
  }
  if (carry) {
    result.unshift(1);
  }
  return result;
};

export const subtractWords = (a: number[], b: number[]): number[] => {
  const n = Math.max(a.length, b.length);
  const result: number[] = new Array(n).fill(0);
  let borrow = 0;
  for (let i = 0; i < n; i++) {
    let ai = a[a.length - 1 - i] ?? 0;
    const bi = b[b.length - 1 - i] ?? 0;
    ai -= borrow;
    if (ai < bi) {
      ai += 0x100000000;
      borrow = 1;
    } else {
      borrow = 0;
    }
    result[n - 1 - i] = (ai - bi) >>> 0;
  }
  while (result.length > 1 && result[0] === 0) result.shift();
  return result;
};

export const addOffset = (base: number[], offset: number[]): number[] => {
  return addWords(base, offset);
};

type MappedAddress = {
  start: number[];
  end: number[];
  ast: ASTBase;
};

export const findMappedAddress = (
  mappings: RangeMapping[],
  address: number[]
): MappedAddress[] => {
  const matches: MappedAddress[] = [];
  for (const mapping of mappings) {
    const childStart = mapping.childAddress;
    const size = mapping.length;
    const childEnd = addWords(childStart, size);

    if (
      compareWords(address, childStart) >= 0 &&
      compareWords(address, childEnd) < 0
    ) {
      const offset = subtractWords(address, childStart);
      const parentStart = mapping.parentAddress;
      const mappedStart = addOffset(parentStart, offset);
      const mappedEnd = addWords(parentStart, size);

      matches.push({
        start: mappedStart,
        end: mappedEnd,
        ast: mapping.ast,
      });
    }
  }

  return matches;
};

type OverlappingMapping = {
  mappingA: RangeMapping;
  mappingB: RangeMapping;
  overlapOn: "child" | "parent" | "child and parent";
};

export const findUniqueMappingOverlaps = (
  mappings: RangeMapping[]
): OverlappingMapping[] => {
  const overlaps: OverlappingMapping[] = [];

  for (let i = 0; i < mappings.length; i++) {
    for (let j = i + 1; j < mappings.length; j++) {
      const a = mappings[i];
      const b = mappings[j];

      const aChildStart = a.childAddress;
      const aChildEnd = addWords(aChildStart, a.length);

      const bChildStart = b.childAddress;
      const bChildEnd = addWords(bChildStart, b.length);

      const aParentStart = a.parentAddress;
      const aParentEnd = addWords(aParentStart, a.length);

      const bParentStart = b.parentAddress;
      const bParentEnd = addWords(bParentStart, b.length);

      const childOverlap =
        compareWords(aChildStart, bChildEnd) < 0 &&
        compareWords(bChildStart, aChildEnd) < 0;

      const parentOverlap =
        compareWords(aParentStart, bParentEnd) < 0 &&
        compareWords(bParentStart, aParentEnd) < 0;

      if (childOverlap || parentOverlap) {
        overlaps.push({
          mappingA: a,
          mappingB: b,
          overlapOn:
            childOverlap && parentOverlap
              ? "child and parent"
              : childOverlap
              ? "child"
              : "parent",
        });
      }
    }
  }

  return overlaps;
};

export function isNestedArray<T>(input: T[] | T[][]): input is T[][] {
  return Array.isArray(input) && Array.isArray(input[0]);
}

export function getCMacroCall(
  ast: ASTBase | undefined
): CMacroCall | undefined {
  if (!ast || ast instanceof CMacroCall) {
    return ast;
  }
  return getCMacroCall(ast.parentNode);
}

export function applyEdits(document: TextDocument, edits: TextEdit[]): string {
  const text = document.getText();

  // Enhanced sorting logic:
  const sorted = edits.slice().sort((a, b) => {
    const aStart = document.offsetAt(a.range.start);
    const bStart = document.offsetAt(b.range.start);

    if (aStart !== bStart) {
      return bStart - aStart; // reverse order
    }

    // If same start offset, sort by end offset descending (longer edits first)
    const aEnd = document.offsetAt(a.range.end);
    const bEnd = document.offsetAt(b.range.end);
    if (aEnd !== bEnd) {
      return bEnd - aEnd;
    }

    // Optionally: insertions before deletions (if newText is empty or not)
    const aIsInsertion = aStart === aEnd && a.newText.length > 0;
    const bIsInsertion = bStart === bEnd && b.newText.length > 0;
    if (aIsInsertion !== bIsInsertion) {
      return aIsInsertion ? 1 : -1; // insertions later
    }

    return 0; // stable
  });

  let result = text;
  for (const edit of sorted) {
    const start = document.offsetAt(edit.range.start);
    const end = document.offsetAt(edit.range.end);
    result = result.slice(0, start) + edit.newText + result.slice(end);
  }

  return result;
}
