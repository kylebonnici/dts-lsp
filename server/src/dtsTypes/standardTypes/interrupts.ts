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
  getU32ValueFromProperty,
  resolvePhandleNode,
} from "./helpers";
import { genStandardTypeDiagnostic } from "../../helpers";
import {
  DiagnosticSeverity,
  ParameterInformation,
} from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType<number>(
    "interrupts",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    undefined,
    (property, macros) => {
      const issues: FileDiagnostic[] = [];

      const values = flatNumberValues(property.ast.values);
      if (!values) {
        return issues;
      }

      const node = property.parent;
      const interruptParent = node.getProperty("interrupt-parent");
      const root = node.root;
      const parentInterruptNode = interruptParent
        ? resolvePhandleNode(interruptParent?.ast.values?.values.at(0), root)
        : node.parent;

      if (!parentInterruptNode) {
        if (!interruptParent) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...property.parent.nodeNameOrLabelRef],
              [],
              [property.name, "interrupt-parent", property.parent.pathString]
            )
          );
          return issues;
        }
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
            interruptParent.ast.values?.values.at(0)?.value ??
              interruptParent.ast
          )
        );
        return issues;
      }

      const childInterruptSpecifier =
        parentInterruptNode.getProperty("#interrupt-cells");

      if (!childInterruptSpecifier) {
        return issues;
      }

      const childInterruptSpecifierValue = getU32ValueFromProperty(
        childInterruptSpecifier,
        0,
        0,
        macros
      );

      if (!childInterruptSpecifierValue) {
        return issues;
      }

      const args = [
        ...Array.from(
          { length: childInterruptSpecifierValue },
          (_, i) => `Interrupt${childInterruptSpecifierValue > 1 ? i : ""}`
        ),
      ];
      prop.signatureArgs = args.map((arg) => ParameterInformation.create(arg));

      const mapProperty = parentInterruptNode.getProperty(`interrupt-map`);
      const addressCellsProperty = node.parent?.getProperty(`#address-cells`);
      if (mapProperty && !addressCellsProperty) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
            property.ast.propertyName ?? property.ast,
            DiagnosticSeverity.Error,
            [...property.parent.nodeNameOrLabelRef],
            [],
            [property.name, "#address-cells", node.parent!.pathString]
          )
        );
      }

      let i = 0;
      while (i < values.length) {
        if (!childInterruptSpecifier) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...parentInterruptNode.nodeNameOrLabelRef],
              [],
              [
                property.name,
                "#interrupt-cells",
                parentInterruptNode.pathString,
              ]
            )
          );

          break;
        }

        const remaining = values.length - i;

        if (childInterruptSpecifierValue > remaining) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.CELL_MISS_MATCH,
              values.at(-1)!,
              DiagnosticSeverity.Error,
              [],
              [],
              [
                property.name,
                `<${[
                  ...Array.from(
                    { length: childInterruptSpecifierValue },
                    () => "Interrupt"
                  ),
                ].join(" ")}> `,
              ]
            )
          );
          return issues;
        }

        const mappingValuesAst = values.slice(
          i,
          i + childInterruptSpecifierValue
        );

        const startAddress = node.mappedReg(macros)?.at(0)?.startAddress;
        if (mapProperty && startAddress) {
          const match = parentInterruptNode.getNexusMapEntyMatch(
            "interrupt",
            macros,
            mappingValuesAst,
            startAddress
          );
          if (!match?.match) {
            issues.push(
              genStandardTypeDiagnostic(
                StandardTypeIssue.NO_NEXUS_MAP_MATCH,
                match.entry,
                DiagnosticSeverity.Error,
                [mapProperty.ast]
              )
            );
          } else {
            property.nexusMapsTo.push({
              mappingValuesAst,
              mapItem: match.match,
            });
          }
        }

        i += childInterruptSpecifierValue;
      }

      return issues;
    }
  );
  prop.description = [
    "The interrupts property of a device node defines the interrupt or interrupts that are generated by the device.The value of the interrupts property consists of an arbitrary number of interrupt specifiers. The format of an interrupt specifier is defined by the binding of the interrupt domain root.",
    "interrupts is overridden by the interrupts-extended property and normally only one or the other should be used.",
  ];
  prop.examples = [
    "A common definition of an interrupt specifier in an open PIC-compatible interrupt domain consists of two cells; an interrupt number and level/sense information. See the following example, which defines a single interrupt specifier, with an interrupt number of OxA and level/sense encoding of 8.",
    "```devicetree\ninterrupts = <0xA 8>;\n```",
  ];
  return prop;
};
