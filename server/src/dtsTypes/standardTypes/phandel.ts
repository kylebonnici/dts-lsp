import { StandardTypeIssue } from "../../types";
import { genIssue } from "../../helpers";
import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj, getU32ValueFromProperty } from "./helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ASTBase } from "../../ast/base";

export default () =>
  new PropertyNodeType(
    "phandle",
    generateOrTypeObj(PropetyType.U32),
    "optional",
    undefined,
    [],
    (property) => {
      const phandelValue = getU32ValueFromProperty(property, 0, 0);
      if (phandelValue) {
        const nodes = property.parent.root.getAllPhandel(phandelValue);
        if (nodes.length > 1 && nodes.at(-1) === property.parent) {
          return [
            genIssue(
              StandardTypeIssue.EXPECTED_UNIQUE_PHANDEL,
              property.ast.values?.values.at(0) ?? property.ast,
              DiagnosticSeverity.Error,
              nodes
                .slice(0, -1)
                .flatMap((n) => n.getProperty("phandle")?.ast)
                .filter((a) => !!a) as ASTBase[],
              [],
              [property.name]
            ),
          ];
        }
      }
      return [];
    }
  );
