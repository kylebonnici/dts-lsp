import { genIssue } from "../../helpers";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { StandardTypeIssue } from "../..//types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "ranges",
    generateOrTypeObj([PropertyType.EMPTY, PropertyType.PROP_ENCODED_ARRAY]),
    "optional",
    undefined,
    [],
    (property) => {
      const value = property.ast.values?.values.at(0)?.value;
      if (!(value instanceof ArrayValues)) {
        return [];
      }

      return value.values.length % 3 === 0
        ? []
        : [
            genIssue(
              StandardTypeIssue.EXPECTED_TRIPLETS,
              property.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [property.name]
            ),
          ];
    }
  );
