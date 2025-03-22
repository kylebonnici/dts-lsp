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
  TextEdit,
  Position as vsCodePosition,
} from "vscode-languageserver";
import { ASTBase } from "./ast/base";
import { Node } from "./context/node";
import { Property } from "./context/property";
import { Runtime } from "./context/runtime";

export type CodeActionDiagnosticData = {
  issues: { edit?: TextEdit; codeActionTitle?: string } & (
    | { type: "SyntaxIssue"; items: SyntaxIssue[] }
    | { type: "StandardTypeIssue"; items: StandardTypeIssue[] }
  );
  firstToken: Omit<Token, "prevToken" | "nextToken" | "uri">;
  lastToken: Omit<Token, "prevToken" | "nextToken" | "uri">;
};

export enum StandardTypeIssue {
  REQUIRED,
  EXPECTED_EMPTY,
  EXPECTED_STRING,
  EXPECTED_STRINGLIST,
  EXPECTED_COMPOSITE_LENGTH,
  EXPECTED_U32,
  EXPECTED_U64,
  EXPECTED_PROP_ENCODED_ARRAY,
  EXPECTED_ONE,
  EXPECTED_ENUM,
  MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
  OMITTED,
  EXPECTED_DEVICE_TYPE_CPU,
  EXPECTED_DEVICE_TYPE_MEMORY,
  DEPRECATED,
  IGNORED,
  PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
  INTERRUPTS_VALUE_CELL_MISS_MATCH,
  INTERRUPTS_PARENT_NODE_NOT_FOUND,
  EXPECTED_UNIQUE_PHANDLE,
  CELL_MISS_MATCH,
  MAP_ENTRY_INCOMPLETE,
  NODE_DISABLED,
  UNABLE_TO_RESOLVE_PHANDLE,
  UNABLE_TO_RESOLVE_PATH,
  EXPECTED_VALUE,
  DEVICETREE_ORG_BINDINGS,
}

export enum SyntaxIssue {
  VALUE,
  END_STATEMENT,
  CURLY_OPEN,
  CURLY_CLOSE,
  OPEN_SQUARE,
  SQUARE_CLOSE,
  PROPERTY_NAME,
  NODE_NAME,
  NODE_ADDRESS,
  NODE_PATH,
  NODE_REF,
  ROOT_NODE_NAME,
  GT_SYM,
  LT_SYM,
  BYTESTRING,
  BYTESTRING_EVEN,
  DOUBLE_QUOTE,
  SINGLE_QUOTE,
  LABEL_NAME,
  FORWARD_SLASH_START_PATH,
  BYTESTRING_HEX,
  MISSING_FORWARD_SLASH_END,
  UNKNOWN,
  NO_STATEMENT,
  LABEL_ASSIGN_MISSING_COLON,
  DELETE_INCOMPLETE,
  MISSING_ROUND_CLOSE,
  EXPECTED_EXPRESSION,
  MISSING_COMMA,
  WHITE_SPACE,
  EXPECTED_IDENTIFIER_FUNCTION_LIKE,
  EXPECTED_IDENTIFIER,
  PROPERTY_MUST_BE_IN_NODE,
  PROPERTY_DELETE_MUST_BE_IN_NODE,
  DELETE_NODE_INCOMPLETE,
  DELETE_PROPERTY_INCOMPLETE,
  UNABLE_TO_RESOLVE_INCLUDE,
  EXPECTED_START_ADDRESS,
  EXPECTED_END_ADDRESS,
  EXPECTED_BITS_SIZE,
  INVALID_BITS_SIZE,
  BITS_NON_OFFICIAL_SYNATX,
  UNKNOWN_MACRO,
}

export enum ContextIssues {
  DUPLICATE_PROPERTY_NAME,
  PROPERTY_DOES_NOT_EXIST,
  DUPLICATE_NODE_NAME,
  UNABLE_TO_RESOLVE_CHILD_NODE,
  LABEL_ALREADY_IN_USE,
  NODE_DOES_NOT_EXIST,
  DELETE_PROPERTY,
  DELETE_NODE,
  UNABLE_TO_RESOLVE_NODE_PATH,
}

export enum LexerToken {
  ASSIGN_OPERATOR,
  SEMICOLON,
  CURLY_OPEN,
  CURLY_CLOSE,
  GT_SYM,
  LT_SYM,
  LOGICAL_NOT,
  BIT_AND,
  BIT_OR,
  BIT_XOR,
  BIT_NOT,
  SQUARE_OPEN,
  SQUARE_CLOSE,
  FORWARD_SLASH,
  BACK_SLASH,
  ADD_OPERATOR,
  NEG_OPERATOR,
  MULTI_OPERATOR,
  MODULUS_OPERATOR,
  DIGIT,
  HEX,
  STRING,
  DOUBLE_QUOTE,
  SINGLE_QUOTE,
  COMMA,
  // EOL,

  C_DEFINE,
  C_INCLUDE,
  C_LINE,
  C_UNDEF,
  C_ERROR,
  C_PRAGMA,

  C_DEFINED,

  C_IF,
  C_IFDEF,
  C_IFNDEF,
  C_ELIF,
  C_ELSE,
  C_ENDIF,

  C_TRUE,
  C_FALSE,
  AMPERSAND,

  UNKNOWN,
  ROUND_OPEN,
  ROUND_CLOSE,
  QUESTION_MARK,
  PERIOD,
  HASH,
  LETTERS,
  UNDERSCORE,
  AT,
  COLON,
}

export const tokenTypes = [
  "namespace",
  "class",
  "enum",
  "interface",
  "struct",
  "typeParameter",
  "type",
  "parameter",
  "variable",
  "property",
  "enumMember",
  "decorator",
  "event",
  "function",
  "method",
  "macro",
  "label",
  "comment",
  "string",
  "keyword",
  "number",
  "regexp",
  "operator",
] as const;

export type SemanticTokenType = (typeof tokenTypes)[number];

export const tokenModifiers = [
  "declaration",
  "definition",
  "readonly",
  "static",
  "deprecated",
  "abstract",
  "async",
  "modification",
  "documentation",
  "defaultLibrary",
] as const;

export type SemanticTokenModifiers = (typeof tokenModifiers)[number];

export interface Position {
  line: number;
  col: number;
  len: number;
}
export interface Token {
  prevToken?: Token;
  nextToken?: Token;
  tokens: readonly LexerToken[];
  pos: Position;
  value: string;
  uri: string;
  sortKey?: number;
}

export interface TokenIndexes {
  start: Token;
  end: Token;
}

export type BuildSemanticTokensPush = (
  tokenType: number,
  tokenModifiers: number,
  tokenIndexes?: TokenIndexes
) => void;

export type IssueTypes = SyntaxIssue | ContextIssues | StandardTypeIssue;
export interface Issue<T extends IssueTypes> {
  issues: T[];
  astElement: ASTBase;
  severity?: DiagnosticSeverity;
  tags?: DiagnosticTag[];
  linkedTo: ASTBase[];
  templateStrings: string[];
  edit?: TextEdit;
  codeActionTitle?: string;
}

export type SearchableResult = {
  runtime: Runtime;
  item: Node | Property | null;
  ast: ASTBase;
};

export interface Searchable {
  getDeepestAstNode(
    file: string,
    position: vsCodePosition
  ): SearchableResult | undefined;
}
