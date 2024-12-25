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

export default () => {
  const prop = new PropertyNodeType(
    "interrupts-extended",
    generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const node = property.parent;
      const interrupts = node.getProperty("interrupts");

      if (interrupts) {
        issues.push(
          genIssue(
            StandardTypeIssue.IGNORED,
            interrupts.ast,
            DiagnosticSeverity.Warning,
            [property.ast],
            [],
            [interrupts.name, "is ignored when 'interrupts-extended' is used"]
          )
        );
      }

      const interruptParent = node.getProperty("interrupt-parent");
      if (interruptParent) {
        issues.push(
          genIssue(
            StandardTypeIssue.IGNORED,
            interruptParent.ast,
            DiagnosticSeverity.Warning,
            [property.ast],
            [],
            [
              interruptParent.name,
              "is ignored when 'interrupts-extended' is used ",
            ]
          )
        );
      }

      const extendedValues = property.ast.values;
      const root = node.root;
      const phandleNodes =
        extendedValues?.values.map((value) =>
          getInterruptPhandelNode(value, root)
        ) ?? [];

      const interruptCells = phandleNodes.map((n) =>
        n ? getInterruptInfo(n) : undefined
      );

      interruptCells.forEach((data, index) => {
        const extendedValue = property.ast.values?.values.at(index)?.value;
        if (!(extendedValue instanceof ArrayValues)) {
          return;
        }

        if (!data) {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERUPTS_PARENT_NODE_NOT_FOUND,
              extendedValue.values.at(0) ?? extendedValue,
              DiagnosticSeverity.Error
            )
          );
          return issues;
        }

        if (!data.cellsProperty) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...data.node.definitons],
              [],
              [
                property.name,
                "#interrupt-cells",
                `/${data.node.path.slice(1).join("/")}`,
              ]
            )
          );
          return;
        }

        if (
          data.value != null &&
          data.value !== extendedValue.values.length - 1
        ) {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERUPTS_VALUE_CELL_MISS_MATCH,
              extendedValue,
              DiagnosticSeverity.Error,
              [data.cellsProperty.ast],
              [],
              [property.name, data.value.toString()]
            )
          );
          return;
        }
      });

      return issues;
    }
  );
  prop.list = true;

  return prop;
};
