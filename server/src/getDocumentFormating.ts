import {
  DocumentFormattingParams,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { DtcBaseNode } from "./ast/dtc/node";
import { DtcProperty } from "./ast/dtc/property";
import { DeleteBase } from "./ast/dtc/delete";
import { ASTBase } from "./ast/base";

export function getDocumentFormating(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware[]
): TextEdit[] {
  const parser = contextAware.find(
    (c) =>
      c.parser.uri ===
      documentFormattingParams.textDocument.uri.replace("file://", "")
  );

  return parser
    ? parser.parser.allAstItems.flatMap((base) => getTextEdit(base))
    : [];
}

const getTextEdit = (
  astNode: ASTBase,
  level = 0,
  line: { value?: number } = { value: undefined }
): TextEdit[] => {
  const delta = 2; // TODO pass in
  const expectedIndent = level * delta;

  if (
    astNode instanceof DtcProperty ||
    astNode instanceof DeleteBase ||
    astNode instanceof DtcBaseNode
  ) {
    const newLine =
      line !== undefined && line.value === astNode.firstToken.pos.line;

    line.value = astNode.firstToken.pos.line;

    const result: TextEdit[] = [];
    const currentIndent = newLine ? 0 : astNode.firstToken.pos.col;
    if (newLine) {
      result.push(
        TextEdit.replace(
          Range.create(
            Position.create(
              astNode.firstToken.pos.line,
              astNode.firstToken.pos.col
            ),
            Position.create(
              astNode.firstToken.pos.line,
              astNode.firstToken.pos.col
            )
          ),
          `\n${"".padStart(expectedIndent, " ")}`
        )
      );
    } else {
      result.push(
        TextEdit.replace(
          Range.create(
            Position.create(astNode.firstToken.pos.line, 0),
            Position.create(astNode.firstToken.pos.line, currentIndent)
          ),
          "".padStart(expectedIndent, " ")
        )
      );
    }

    if (astNode instanceof DtcBaseNode) {
      result.push(
        ...astNode.children.flatMap((c) => getTextEdit(c, level + 1, line))
      );

      if (astNode.closeScope) {
        const newLine =
          line !== undefined && line.value === astNode.closeScope.pos.line;
        const currentIndent = newLine ? 0 : astNode.closeScope.pos.col;

        line.value = astNode.closeScope.pos.line;

        if (newLine) {
          result.push(
            TextEdit.replace(
              Range.create(
                Position.create(
                  astNode.closeScope.pos.line,
                  astNode.closeScope.pos.col
                ),
                Position.create(
                  astNode.closeScope.pos.line,
                  astNode.closeScope.pos.col
                )
              ),
              `\n${"".padStart(expectedIndent, " ")}`
            )
          );
        } else {
          result.push(
            TextEdit.replace(
              Range.create(
                Position.create(astNode.closeScope.pos.line, 0),
                Position.create(astNode.closeScope.pos.line, currentIndent)
              ),
              "".padStart(expectedIndent, " ")
            )
          );
        }
      }
    }

    return result;
  }

  return [];
};
