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
  getInterruptPhandleNode,
  getU32ValueFromProperty,
} from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () => {
  const prop = new PropertyNodeType(
    (name) => {
      if (name.startsWith("interrupt-")) {
        return false;
      }

      return !!name.match(/^[A-Z-a-z]+-map$/);
    },
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const specifier = property.name.split("-map", 1)[0];

      const issues: Issue<StandardTypeIssue>[] = [];
      const node = property.parent;
      const root = property.parent.root;
      const childSpecifierCells = node.getProperty(`#${specifier}-cells`);

      property.ast.values?.values.forEach((values) => {
        if (!values) {
          return [];
        }

        if (!childSpecifierCells) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...node.nodeNameOrLabelRef],
              [],
              [
                property.name,
                `#${specifier}-cells`,
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
          return issues;
        }

        const childSpecifierCellsValue = getU32ValueFromProperty(
          childSpecifierCells,
          0,
          0
        );

        if (childSpecifierCellsValue == null) {
          return issues;
        }

        if (!(values.value instanceof ArrayValues)) {
          return issues;
        }

        let entryEndIndex = 0;
        let i = 0;
        while (i < values.value.values.length) {
          i += childSpecifierCellsValue;

          if (values.value.values.length < i + 1) {
            const expLen = childSpecifierCellsValue + 1;
            issues.push(
              genIssue(
                StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
                values.value.values[values.value.values.length - 1],
                DiagnosticSeverity.Error,
                [],
                [],
                [
                  property.name,
                  `after the last value of ${[
                    ...Array.from(
                      { length: childSpecifierCellsValue },
                      () => "ChildSpecifier"
                    ),
                    "SpecifierParent ParentSpecifier...",
                  ]
                    .slice(
                      (values.value.values.length - entryEndIndex) % expLen ===
                        0
                        ? expLen
                        : (values.value.values.length - entryEndIndex) % expLen
                    )
                    .join(" ")}`,
                ]
              )
            );
            break;
          }
          const specifierParent = getInterruptPhandleNode(values, root, i);
          if (!specifierParent) {
            issues.push(
              genIssue(
                StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
                values.value.values[i],
                DiagnosticSeverity.Error
              )
            );
            break;
          }

          const parentSpecifierAddress = specifierParent.getProperty(
            `#${specifier}-cells`
          );

          if (!parentSpecifierAddress) {
            issues.push(
              genIssue(
                StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
                values.value.values[i],
                DiagnosticSeverity.Error,
                [...specifierParent.nodeNameOrLabelRef],
                [],
                [
                  property.name,
                  `#${specifier}-cells`,
                  `/${node.path.slice(1).join("/")}`,
                ]
              )
            );
            return issues;
          }

          i++;

          const parentUnitAddressValue = getU32ValueFromProperty(
            parentSpecifierAddress,
            0,
            0
          );

          if (parentUnitAddressValue == null) {
            break;
          }

          i += parentUnitAddressValue;
          if (values.value.values.length < i) {
            const expLen =
              childSpecifierCellsValue + 1 + parentUnitAddressValue;
            issues.push(
              genIssue(
                StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
                values.value.values[values.value.values.length - 1],
                DiagnosticSeverity.Error,
                [],
                [],
                [
                  property.name,
                  `after the last value of ${[
                    ...Array.from(
                      { length: childSpecifierCellsValue },
                      () => "ChildSpecifier"
                    ),
                    "InterruptParent",
                    ...Array.from(
                      { length: parentUnitAddressValue },
                      () => "ParentSpecifier"
                    ),
                  ]
                    .slice(
                      (values.value.values.length - entryEndIndex) % expLen ===
                        0
                        ? expLen
                        : (values.value.values.length - entryEndIndex) % expLen
                    )
                    .join(" ")}`,
                ]
              )
            );
            break;
          }
          entryEndIndex = i;
        }
      });

      return issues;
    }
  );
  return prop;
};
