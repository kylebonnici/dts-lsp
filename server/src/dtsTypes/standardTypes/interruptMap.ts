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

import { BindingPropertyType } from "../../types/index";
import { FileDiagnostic, StandardTypeIssue } from "../../types";
import { PropertyNodeType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  resolvePhandleNode,
  getU32ValueFromProperty,
} from "./helpers";
import { genStandardTypeDiagnostic } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () => {
  const prop = new PropertyNodeType(
    "interrupt-map",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: FileDiagnostic[] = [];
      const node = property.parent;
      const root = property.parent.root;

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const childAddressCells = node.getProperty("#address-cells");
      const childInterruptSpecifier = node.getProperty("#interrupt-cells");

      if (!childInterruptSpecifier) {
        issues.push(
          genStandardTypeDiagnostic(
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

        return issues;
      }

      let i = 0;
      while (i < values.length) {
        const childAddressCellsValue = childAddressCells
          ? getU32ValueFromProperty(childAddressCells, 0, 0)
          : 2;

        const childInterruptSpecifierValue = getU32ValueFromProperty(
          childInterruptSpecifier,
          0,
          0
        );
        if (
          childAddressCellsValue == null ||
          childInterruptSpecifierValue == null
        ) {
          return issues;
        }

        let entryEndIndex = 0;

        i += childAddressCellsValue + childInterruptSpecifierValue;

        const expLen =
          childAddressCellsValue + childInterruptSpecifierValue + 1;
        prop.typeExample ??= "";
        prop.typeExample += `<${[
          ...Array.from(
            { length: childAddressCellsValue },
            () => "ChildAddress"
          ),
          ...Array.from(
            { length: childInterruptSpecifierValue },
            () => "ChildInterruptSpecifier"
          ),
          "InterruptParent ParentUnitAddress... ParentInterruptSpecifier...",
        ].join(" ")}> `;

        if (values.length < i + 1) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values[values.length - 1],
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
                    (values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        const interruptParent = resolvePhandleNode(values[i], root);
        if (!interruptParent) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              values[i],
              DiagnosticSeverity.Error
            )
          );
          break;
        }

        const parentUnitAddress = interruptParent.getProperty("#address-cells");
        const parentInterruptSpecifier =
          interruptParent.getProperty("#interrupt-cells");

        if (!parentInterruptSpecifier) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              values[i],
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

          break;
        }

        i++;

        const parentUnitAddressValue = parentUnitAddress
          ? getU32ValueFromProperty(parentUnitAddress, 0, 0)
          : 2;
        const parentInterruptSpecifierValue = getU32ValueFromProperty(
          parentInterruptSpecifier,
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
        if (values.length < i) {
          const expLen =
            childAddressCellsValue +
            childInterruptSpecifierValue +
            1 +
            parentUnitAddressValue +
            parentInterruptSpecifierValue;
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values[values.length - 1],
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
                    (values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        entryEndIndex = i;
      }

      if (!property.ast.values) {
        return [];
      }

      for (let ii = 0; ii < property.ast.values.values.length; ii++) {
        const values = property.ast.values.values.at(ii);

        if (!values) {
          continue;
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
      }

      return issues;
    }
  );
  prop.description = [
    "An interrupt-map is a property on a nexus node that bridges one interrupt domain with a set of parent interrupt domains and specifies how interrupt specifiers in the child domain are mapped to their respective parent domains.",
    "The interrupt map is a table where each row is a mapping entry consisting of five components: child unit address, child interrupt specifier, interrupt-parent, parent unit address, parent interrupt specifier.",
    "- child unit address: The unit address of the child node being mapped. The number of 32-bit cells required to specify this is described by the #address-cells property of the bus node on which the child is located.",
    "- child interrupt specifier: The interrupt specifier of the child node being mapped. The number of 32-bit cells required to specify this component is described by the #interrupt-cells property of this node-the nexus node containing the interrupt-map property.",
    "- interrupt-parent: A single <phandle > value that points to the interrupt parent to which the child domain is being mapped.",
    "- parent unit address: The unit address in the domain of the interrupt parent. The number of 32-bit cells required to specify this address is described by the #address-cells property of the node pointed to by the interrupt-parent field.",
    "- parent interrupt specifier: The interrupt specifier in the parent domain. The number of 32-bit cells required to specify this component is described by the #interrupt-cells property of the node pointed to by the interrupt-parent field.",
    "Lookups are performed on the interrupt mapping table by matching a unit-address/interrupt specifier pair against the child components in the interrupt-map. Because some fields in the unit interrupt specifier may not be relevant, a mask is applied before the lookup is done. This mask is defined in the interrupt-map-mask property",
    "Note: Both the child node and the interrupt parent node are required to have #address-cells and #interrupt-cells properties defined. If a unit address component is not required ,#address-cells shall be explicitly defined to be zero.",
  ];
  return prop;
};
