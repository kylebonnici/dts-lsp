import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "interrupt-parent",
    generateOrTypeObj(PropetyType.U32),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const node = property.parent;
      const interrupt = node.getProperty("interrupts");

      if (!interrupt) {
        issues.push(
          genIssue(
            StandardTypeIssue.IGNORED,
            property.ast,
            DiagnosticSeverity.Warning,
            [],
            [],
            [property.name, "is ignored due to missing 'interrupt' property"]
          )
        );
      }
      return issues;
    }
  );
