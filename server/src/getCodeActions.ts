import {
  CodeAction,
  CodeActionKind,
  CodeActionParams,
  Diagnostic,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { SyntaxIssue } from "./types";

const syntaxIssueToCodeAction = (
  issue: SyntaxIssue,
  diagnostic: Diagnostic,
  uri: string
): CodeAction | undefined => {
  switch (issue) {
    case SyntaxIssue.END_STATMENT:
      return {
        title: "Add semicolun",
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
                ";"
              ),
            ],
          },
        },
      };
    case SyntaxIssue.CURLY_OPEN:
    case SyntaxIssue.CURLY_CLOSE:
    case SyntaxIssue.OPEN_SQUARE:
    case SyntaxIssue.SQUARE_CLOSE:
    case SyntaxIssue.GT_SYM:
    case SyntaxIssue.LT_SYM:
    case SyntaxIssue.DUOUBE_QUOTE:
    case SyntaxIssue.SINGLE_QUOTE:
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
    case SyntaxIssue.FORWARD_SLASH_END_DELETE:
    case SyntaxIssue.NO_STAMENTE:
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
    case SyntaxIssue.NODE_PATH_WHITE_SPACE_NOT_ALLOWED:
    case SyntaxIssue.MISSING_ROUND_CLOSE:
    case SyntaxIssue.INCLUDE_CLOSE_PATH:
    case SyntaxIssue.MISSING_COMMA:
      return;
  }
};

export function getCodeActions(
  codeActionParams: CodeActionParams
): CodeAction[] {
  return codeActionParams.context.diagnostics
    .flatMap((diagnostic) => {
      const tmp = diagnostic.data as { syntaxIssue?: SyntaxIssue }[];
      return tmp.map((d) => {
        if (d.syntaxIssue !== undefined) {
          return syntaxIssueToCodeAction(
            d.syntaxIssue,
            diagnostic,
            codeActionParams.textDocument.uri
          );
        }
      });
    })
    .filter((c) => !!c) as CodeAction[];
}
