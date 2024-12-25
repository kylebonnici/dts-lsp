import { genIssue } from "../../helpers";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "name",
    generateOrTypeObj(PropertyType.STRING),
    "optional",
    undefined,
    [],
    (property) => [
      genIssue(
        StandardTypeIssue.DEPRECATED,
        property.ast,
        DiagnosticSeverity.Warning,
        [],
        [],
        [property.name]
      ),
    ]
  );
  prop.hideAutoComplete = true;
  return prop;
};
