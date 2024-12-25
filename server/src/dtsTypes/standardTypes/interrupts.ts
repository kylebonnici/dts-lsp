import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropetyType } from "../types";
import {
  generateOrTypeObj,
  getInterruptInfo,
  getInterruptPhandelNode,
} from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () =>
  new PropertyNodeType(
    "interrupts",
    generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const node = property.parent;
      const interruptParent = node.getProperty("interrupt-parent");
      const root = node.root;
      const parentInterruptNode = interruptParent
        ? getInterruptPhandelNode(
            interruptParent?.ast.values?.values.at(0),
            root
          )
        : node.parent;

      if (!parentInterruptNode) {
        if (!interruptParent) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...property.parent.definitons],
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
              StandardTypeIssue.INTERUPTS_PARENT_NODE_NOT_FOUND,
              interruptParent.ast.values?.values.at(0)?.value ??
                interruptParent.ast
            )
          );
          return issues;
        }
      }

      const interruptCell = getInterruptInfo(parentInterruptNode);

      if (!interruptCell.cellsProperty) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...parentInterruptNode.definitons],
            [],
            [
              property.name,
              "#interrupt-cells",
              `/${parentInterruptNode.path.slice(1).join("/")}`,
            ]
          )
        );
        return issues;
      }

      const interruptValue = property.ast.values?.values.at(0)?.value;
      if (interruptValue instanceof ArrayValues) {
        if (interruptCell.node) {
          if (
            interruptCell.value != null &&
            interruptCell.value !== interruptValue.values.length
          ) {
            issues.push(
              genIssue(
                StandardTypeIssue.INTERUPTS_VALUE_CELL_MISS_MATCH,
                interruptValue,
                DiagnosticSeverity.Error,
                [interruptCell.cellsProperty.ast],
                [],
                [property.name, interruptCell.value.toString()]
              )
            );
          }
        }
      }

      return issues;
    }
  );
