/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropertyType } from "../types";
import {
  generateOrTypeObj,
  getInterruptInfo,
  getInterruptPhandleNode,
} from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () => {
  const prop = new PropertyNodeType(
    "interrupts-extended",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
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
          getInterruptPhandleNode(value, root)
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
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              extendedValue.values.at(0) ?? extendedValue,
              DiagnosticSeverity.Error
            )
          );
          return issues;
        }

        if (!data.cellsProperty) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...data.node.nodeNameOrLabelRef],
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
              StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH,
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

  return prop;
};
