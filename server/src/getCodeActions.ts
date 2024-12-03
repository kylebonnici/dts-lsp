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
): CodeAction | undefined => {
  switch (issue) {
    case SyntaxIssue.END_STATMENT:
      return {
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
      };
    case SyntaxIssue.CURLY_OPEN:
      return {
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
      };
    case SyntaxIssue.WHITE_SPACE:
      return {
        title: "Remove white space",
        diagnostics: [diagnostic],
        kind: CodeActionKind.QuickFix,
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
                  Position.create(diagnostic.range.end.line, lastToken.pos.col)
                ),
                ""
              ),
            ],
          },
        },
      };
    case SyntaxIssue.CURLY_CLOSE:
      return {
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
      };
    case SyntaxIssue.OPEN_SQUARE:
    case SyntaxIssue.SQUARE_CLOSE:
    case SyntaxIssue.GT_SYM:
    case SyntaxIssue.LT_SYM:
    case SyntaxIssue.DUOUBE_QUOTE:
    case SyntaxIssue.SINGLE_QUOTE:
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
      return {
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
      };
    case SyntaxIssue.FORWARD_SLASH_END_DELETE:
    case SyntaxIssue.NO_STAMENTE:
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
    case SyntaxIssue.MISSING_ROUND_CLOSE:
    case SyntaxIssue.INCLUDE_CLOSE_PATH:
    case SyntaxIssue.MISSING_COMMA:
    default:
      return;
  }
};

export function getCodeActions(
  codeActionParams: CodeActionParams
): CodeAction[] {
  return codeActionParams.context.diagnostics
    .flatMap((diagnostic) => {
      const tmp = diagnostic.data as CodeActionDiagnosticData | undefined;
      return tmp?.issues.map((issue) => {
        return syntaxIssueToCodeAction(
          tmp.firstToken,
          tmp.lastToken,
          issue,
          diagnostic,
          codeActionParams.textDocument.uri
        );
      });
    })
    .filter((c) => !!c) as CodeAction[];
}
