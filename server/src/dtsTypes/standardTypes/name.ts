import { genIssue } from "../../helpers";
import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "name",
    generateOrTypeObj(PropetyType.STRING),
    "optional",
    undefined,
    [],
    (property) => [
      genIssue(
        StandardTypeIssue.DEPRICATED,
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
