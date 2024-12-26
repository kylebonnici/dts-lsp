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
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { CodeActionDiagnosticData, SyntaxIssue, Token } from "./types";

const syntaxIssueToCodeAction = (
  firstToken: Token,
  lastToken: Token,
  issue: SyntaxIssue,
  diagnostic: Diagnostic,
  uri: string
): CodeAction[] | undefined => {
  switch (issue) {
    case SyntaxIssue.END_STATEMENT:
      return [
        {
          title: "Add semicolon",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  ";"
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.CURLY_OPEN:
      return [
        {
          title: "Add open curly",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  " {"
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.WHITE_SPACE:
      return [
        {
          title: "Remove white space",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.replace(
                  Range.create(
                    Position.create(
                      diagnostic.range.start.line,
                      firstToken.pos.col + firstToken.pos.len
                    ),
                    Position.create(
                      diagnostic.range.end.line,
                      lastToken.pos.col
                    )
                  ),
                  ""
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.CURLY_CLOSE:
      return [
        {
          title: "Add close curly",
          diagnostics: [diagnostic],
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  "}"
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
      return [
        {
          title: "Add '/'",
          diagnostics: [diagnostic],
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  "/"
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.MISSING_COMMA:
      return [
        {
          title: "Add comma",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  ","
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.MISSING_FORWARD_SLASH_END:
      return [
        {
          title: "Add '/'",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  "/"
                ),
              ],
            },
          },
        },
      ];
    case SyntaxIssue.NO_STATEMENT:
      return [
        {
          title: "Remove ';'",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [TextEdit.del(diagnostic.range)],
            },
          },
        },
      ];
    case SyntaxIssue.DELETE_NODE_INCOMPLETE:
      return [
        {
          title: "Complete Keyword '/delete-node/",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [TextEdit.replace(diagnostic.range, "/delete-node/")],
            },
          },
        },
      ];
    case SyntaxIssue.DELETE_PROPERTY_INCOMPLETE:
      return [
        {
          title: "Complete Keyword '/delete-property/",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [TextEdit.replace(diagnostic.range, "/delete-property/")],
            },
          },
        },
      ];
    case SyntaxIssue.DELETE_INCOMPLETE:
      return [
        {
          title: "Complete Keyword '/delete-property/",
          diagnostics: [diagnostic],
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [TextEdit.replace(diagnostic.range, "/delete-property/")],
            },
          },
        },
        {
          title: "Complete Keyword '/delete-node/",
          diagnostics: [diagnostic],
          kind: CodeActionKind.QuickFix,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [TextEdit.replace(diagnostic.range, "/delete-node/")],
            },
          },
        },
      ];
    case SyntaxIssue.GT_SYM:
      return [
        {
          title: "Add '>'",
          diagnostics: [diagnostic],
          kind: CodeActionKind.SourceFixAll,
          isPreferred: true,
          edit: {
            changes: {
              [uri]: [
                TextEdit.insert(
                  Position.create(
                    diagnostic.range.end.line,
                    diagnostic.range.end.character
                  ),
                  ">"
                ),
              ],
            },
          },
        },
      ];
    default:
      return;
  }
};

export function getCodeActions(
  codeActionParams: CodeActionParams
): CodeAction[] {
  const results = codeActionParams.context.diagnostics
    .flatMap((diagnostic) => {
      const tmp = diagnostic.data as CodeActionDiagnosticData | undefined;
      return tmp?.issues.flatMap((issue) =>
        syntaxIssueToCodeAction(
          tmp.firstToken,
          tmp.lastToken,
          issue,
          diagnostic,
          codeActionParams.textDocument.uri
        )
      );
    })
    .filter((c) => !!c) as CodeAction[];

  const onSaveAuto = results.filter(
    (r) => r.kind === CodeActionKind.SourceFixAll
  );
  const others = results.filter((r) => r.kind !== CodeActionKind.SourceFixAll);
  const combinedEdits = onSaveAuto.flatMap(
    (p) => p.edit?.changes?.[codeActionParams.textDocument.uri] ?? []
  );

  return [
    ...others,
    ...onSaveAuto.map((o) => ({ ...o, kind: CodeActionKind.QuickFix })),
    ...(combinedEdits.length
      ? [
          {
            title: "Fix All",
            kind: CodeActionKind.SourceFixAll,
            isPreferred: true,
            edit: {
              changes: {
                [codeActionParams.textDocument.uri]: combinedEdits,
              },
            },
          },
        ]
      : []),
  ];
}
