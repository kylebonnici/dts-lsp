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

export function getDocumentFormating(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware[]
): TextEdit[] {
  const parser = contextAware.find(
    (c) =>
      c.parser.uri ===
      documentFormattingParams.textDocument.uri.replace("file://", "")
  );

  return parser ? getTextEdit(parser.parser.rootDocument) : [];
}

const getTextEdit = (
  node: DtcBaseNode,
  level = 0,
  line: { value?: number } = { value: undefined }
): TextEdit[] => {
  const delta = 2; // TODO pass in
  const expectedIndent = level * delta;

  return node.children.flatMap((c) => {
    if (
      c instanceof DtcProperty ||
      c instanceof DeleteBase ||
      c instanceof DtcBaseNode
    ) {
      const newLine =
        line !== undefined && line.value === c.firstToken.pos.line;

      line.value = c.firstToken.pos.line;

      const result: TextEdit[] = [];
      const currentIndent = newLine ? 0 : c.firstToken.pos.col;
      if (newLine) {
        result.push(
          TextEdit.replace(
            Range.create(
              Position.create(c.firstToken.pos.line, c.firstToken.pos.col),
              Position.create(c.firstToken.pos.line, c.firstToken.pos.col)
            ),
            `\n${"".padStart(expectedIndent, " ")}`
          )
        );
      } else {
        result.push(
          TextEdit.replace(
            Range.create(
              Position.create(c.firstToken.pos.line, 0),
              Position.create(c.firstToken.pos.line, currentIndent)
            ),
            "".padStart(expectedIndent, " ")
          )
        );
      }

      if (c instanceof DtcBaseNode) {
        result.push(...getTextEdit(c, level + 1, line));

        if (c.closeScope) {
          const newLine =
            line !== undefined && line.value === c.closeScope.pos.line;
          const currentIndent = newLine ? 0 : c.closeScope.pos.col;

          line.value = c.closeScope.pos.line;

          if (newLine) {
            result.push(
              TextEdit.replace(
                Range.create(
                  Position.create(c.closeScope.pos.line, c.closeScope.pos.col),
                  Position.create(c.closeScope.pos.line, c.closeScope.pos.col)
                ),
                `\n${"".padStart(expectedIndent, " ")}`
              )
            );
          } else {
            result.push(
              TextEdit.replace(
                Range.create(
                  Position.create(c.closeScope.pos.line, 0),
                  Position.create(c.closeScope.pos.line, currentIndent)
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
  });
};
