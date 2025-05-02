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
import {
  findUniqueMappingOverlaps,
  genStandardTypeDiagnostic,
} from "../../helpers";
import { PropertyNodeType } from "../types";
import { addWords, compareWords } from "../../helpers";
import { flatNumberValues, generateOrTypeObj } from "./helpers";

import { FileDiagnostic, StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType<number>(
    "ranges",
    generateOrTypeObj([
      BindingPropertyType.EMPTY,
      BindingPropertyType.PROP_ENCODED_ARRAY,
    ]),
    "optional",
    undefined,
    undefined,
    (property, macros) => {
      const issues: FileDiagnostic[] = [];

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const sizeCellValue = property.parent.sizeCells(macros);
      const childBusAddressValue = property.parent.addressCells(macros);
      const parentdBusAddressValue = property.parent.parentAddressCells(macros);

      prop.typeExample = `<${[
        ...Array.from(
          { length: childBusAddressValue },
          () => "child-bus-address"
        ),
        ...Array.from(
          { length: parentdBusAddressValue },
          () => "parent-bus-address"
        ),
        ...Array.from({ length: parentdBusAddressValue }, () => "size"),
      ].join(" ")}>`;

      if (
        values.length === 0 ||
        values.length %
          (childBusAddressValue + parentdBusAddressValue + sizeCellValue) !==
          0
      ) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.CELL_MISS_MATCH,
            values.at(
              values.length -
                (values.length %
                  (childBusAddressValue +
                    parentdBusAddressValue +
                    sizeCellValue))
            ) ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name, prop.typeExample]
          )
        );
      }

      if (issues.length === 0) {
        const mappings = property.parent.rangeMap(macros);
        mappings &&
          findUniqueMappingOverlaps(mappings).forEach((overlap) => {
            issues.push(
              genStandardTypeDiagnostic(
                StandardTypeIssue.RANGES_OVERLAP,
                overlap.mappingA.ast,
                DiagnosticSeverity.Error,
                [overlap.mappingB.ast],
                [],
                [overlap.overlapOn]
              )
            );
          });

        const thisNodeReg = property.parent.reg(macros);
        if (thisNodeReg) {
          mappings?.forEach((m) => {
            const ends = addWords(m.parentAddress, m.length);
            if (
              compareWords(thisNodeReg.endAddress, ends) < 0 ||
              compareWords(thisNodeReg.startAddress, m.parentAddress) > 0
            ) {
              issues.push(
                genStandardTypeDiagnostic(
                  StandardTypeIssue.RANGE_EXCEEDS_ADDRESS_SPACE,
                  m.ast,
                  DiagnosticSeverity.Warning,
                  [thisNodeReg.ast],
                  [],
                  [
                    property.name,
                    `0x${m.parentAddress
                      .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                      .join("")}`,
                    `0x${ends
                      .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                      .join("")}`,
                    `0x${thisNodeReg.startAddress
                      .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                      .join("")}`,
                    `0x${thisNodeReg.endAddress
                      .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                      .join("")}`,
                  ]
                )
              );
            }
          });
        }

        property.parent.nodes.forEach((childNode) => {
          const reg = childNode.getProperty("reg");
          if (!reg) return;

          const mappedAddress = childNode.mappedReg(macros);
          if (!mappedAddress?.mappingEnd || !mappedAddress.mappedAst) return;

          if (!mappedAddress.inMappingRange) {
            issues.push(
              genStandardTypeDiagnostic(
                StandardTypeIssue.EXCEEDS_MAPPING_ADDRESS,
                reg.ast.values ?? reg.ast,
                DiagnosticSeverity.Warning,
                [mappedAddress.mappedAst],
                [],
                [
                  reg.name,
                  `0x${mappedAddress.endAddress
                    .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                    .join("")}`,
                  `0x${mappedAddress.mappingEnd
                    .map((c, i) => c.toString(16).padStart(i ? 8 : 0))
                    .join("")}`,
                ]
              )
            );
          }
        });
      }

      return issues;
    }
  );
  prop.description = [
    `The ranges property provides a means of defining a mapping or translation between the address space of the bus (the child address space) and the address space of the bus node's parent (the parent address space).`,
    "The format of the value of the ranges property is an arbitrary number of triplets of (child-bus-address, parent-bus-address, length)",
    "- The child-bus-address is a physical address within the child bus' address space. The number of cells to represent the address is bus dependent and can be determined from the #address-cells of this node (the node in which the ranges property appears).",
    "- The parent-bus-address is a physical address within the parent bus' address space. The number of cells to represent the parent address is bus dependent and can be determined from the #address-cells property of the node that defines the parent's address space.",
    "- The length specifies the size of the range in the child's address space. The number of cells to represent the size can be determined from the #size-cells of this node (the node in which the ranges property appears).",
    "If the property is defined with an < empty> value, it specifies that the parent and child address space is identical, and no address translation is required.",
    "If the property is not present in a bus node, it is assumed that no mapping exists between children of the node and the parent address space.",
  ];
  prop.examples = [
    "Address Translation Example:",
    [
      "```devicetree",
      `soc {
\tcompatible = "simple-bus";
\t#address-cells = <1>;
\t#size-cells = <1>;
\tranges = <0x0 0xe0000000 0x00100000>;
\t\tserial@4600 {
\t\tdevice_type = "serial";
\t\tcompatible = "ns16550";
\t\treg = <0x4600 0x100>;
\t\tclock-frequency = <0>;
\t\tinterrupts = <0xA 0x8>;
\t\tinterrupt-parent = <&ipic>;
\t};
};`,
      "```",
    ].join("\n"),
    "The soc node specifies a ranges property of",
    ["```devicetree", `<Ox0 Oxe0000000 0x00100000>;`, "```"].join("\n"),
    "This property value specifies that for a 1024 KB range of address space, a child node addressed at physical OxO maps to a parent address of physical 0xe0000000. With this mapping, the serial device node can be addressed by a load or store at address 0xe0004600, an offset of 0x4600 (specified in reg) plus the 0xe0000000 mapping specified in ranges.",
  ];
  return prop;
};
