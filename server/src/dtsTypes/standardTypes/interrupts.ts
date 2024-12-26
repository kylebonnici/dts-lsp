import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj, getInterruptPhandleNode } from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "interrupts",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const node = property.parent;
      const interruptParent = node.getProperty("interrupt-parent");
      const root = node.root;
      const parentInterruptNode = interruptParent
        ? getInterruptPhandleNode(
            interruptParent?.ast.values?.values.at(0),
            root
          )
        : node.parent;

      if (!parentInterruptNode) {
        if (!interruptParent) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...property.parent.nodeNameOrLabelRef],
              [],
              [
                property.name,
                "interrupt-parent",
                `/${property.parent.path.slice(1).join("/")}`,
              ]
            )
          );
          return issues;
        } else {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              interruptParent.ast.values?.values.at(0)?.value ??
                interruptParent.ast
            )
          );
          return issues;
        }
      }

      // TODO get cout from bindings. anc compare count

      return issues;
    }
  );
