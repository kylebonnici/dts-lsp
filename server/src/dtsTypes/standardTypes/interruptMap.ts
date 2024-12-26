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
import { PropertyNodeType, PropertyType as PropertyType } from "../types";
import {
  generateOrTypeObj,
  getInterruptPhandleNode,
  getU32ValueFromProperty,
} from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () =>
  new PropertyNodeType(
    "interrupt-map",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];
      const node = property.parent;
      const root = property.parent.root;
      const childAddressCells = node.getProperty("#address-cells");
      const childInterruptSpecifier = node.getProperty("#interrupt-cells");

      const values = property.ast.values?.values.at(0);

      if (!values) {
        return [];
      }

      if (!childAddressCells) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...node.nodeNameOrLabelRef],
            [],
            [
              property.name,
              "#address-cells",
              `/${node.path.slice(1).join("/")}`,
            ]
          )
        );
      }

      if (!childInterruptSpecifier) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...node.nodeNameOrLabelRef],
            [],
            [
              property.name,
              "#interrupt-cells",
              `/${node.path.slice(1).join("/")}`,
            ]
          )
        );
      }

      if (issues.length) {
        return issues;
      }

      const childAddressCellsValue = getU32ValueFromProperty(
        childAddressCells!,
        0,
        0
      );

      const childInterruptSpecifierValue = getU32ValueFromProperty(
        childInterruptSpecifier!,
        0,
        0
      );

      if (
        childAddressCellsValue == null ||
        childInterruptSpecifierValue == null
      ) {
        return issues;
      }

      if (!(values.value instanceof ArrayValues)) {
        return issues;
      }

      let entryStartIndex = 0;
      let entryEndIndex = 0;
      let i = 0;
      while (i < values.value.values.length) {
        entryStartIndex = i;
        i += childAddressCellsValue + childInterruptSpecifierValue;

        if (values.value.values.length < i + 1) {
          const expLen =
            childAddressCellsValue + childInterruptSpecifierValue + 1;
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
                    { length: childAddressCellsValue },
                    () => "ChildAddress"
                  ),
                  ...Array.from(
                    { length: childInterruptSpecifierValue },
                    () => "ChildInterruptSpecifier"
                  ),
                  "InterruptParent ParentUnitAddress... ParentInterruptSpecifier...",
                ]
                  .slice(
                    (values.value.values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.value.values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        const interruptParent = getInterruptPhandleNode(values, root, i);
        if (!interruptParent) {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              values.value.values[i],
              DiagnosticSeverity.Error
            )
          );
          break;
        }

        const parentUnitAddress = interruptParent.getProperty("#address-cells");
        const parentInterruptSpecifier =
          interruptParent.getProperty("#interrupt-cells");

        if (!parentUnitAddress) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              values.value.values[i],
              DiagnosticSeverity.Error,
              [...interruptParent.nodeNameOrLabelRef],
              [],
              [
                property.name,
                "#address-cells",
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
        }

        if (!parentInterruptSpecifier) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              values.value.values[i],
              DiagnosticSeverity.Error,
              [...interruptParent.nodeNameOrLabelRef],
              [],
              [
                property.name,
                "#interrupt-cells",
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
        }

        if (issues.length) {
          break;
        }

        i++;

        const parentUnitAddressValue = getU32ValueFromProperty(
          parentUnitAddress!,
          0,
          0
        );
        const parentInterruptSpecifierValue = getU32ValueFromProperty(
          parentInterruptSpecifier!,
          0,
          0
        );

        if (
          parentUnitAddressValue == null ||
          parentInterruptSpecifierValue == null
        ) {
          break;
        }

        i += parentUnitAddressValue + parentInterruptSpecifierValue;
        if (values.value.values.length < i) {
          const expLen =
            childAddressCellsValue +
            childInterruptSpecifierValue +
            1 +
            parentUnitAddressValue +
            parentInterruptSpecifierValue;
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
                    { length: childAddressCellsValue },
                    () => "ChildAddress"
                  ),
                  ...Array.from(
                    { length: childInterruptSpecifierValue },
                    () => "ChildInterruptSpecifier"
                  ),
                  "InterruptParent",
                  ...Array.from(
                    { length: parentUnitAddressValue },
                    () => "ParentUnitAddress"
                  ),
                  ...Array.from(
                    { length: parentInterruptSpecifierValue },
                    () => "ParentInterruptSpecifier"
                  ),
                ]
                  .slice(
                    (values.value.values.length - entryEndIndex) % expLen === 0
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

      return issues;
    }
  );
