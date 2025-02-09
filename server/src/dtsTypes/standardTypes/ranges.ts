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

import { genIssue } from "../../helpers";
import { PropertyNodeType, PropertyType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
} from "./helpers";
import { Issue, StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "ranges",
    generateOrTypeObj([PropertyType.EMPTY, PropertyType.PROP_ENCODED_ARRAY]),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const sizeCellProperty = property.parent?.getProperty("#size-cells");
      const childBusAddress = property.parent?.getProperty("#address-cells");
      const parentdBusAddress =
        property.parent.parent?.getProperty("#address-cells");

      const sizeCellValue = sizeCellProperty
        ? getU32ValueFromProperty(sizeCellProperty, 0, 0) ?? 1
        : 1;

      const childBusAddressValue = childBusAddress
        ? getU32ValueFromProperty(childBusAddress, 0, 0) ?? 2
        : 2;
      const parentdBusAddressValue = parentdBusAddress
        ? getU32ValueFromProperty(parentdBusAddress, 0, 0) ?? 2
        : 2;

      if (
        values.length === 0 ||
        values.length %
          (childBusAddressValue + parentdBusAddressValue + sizeCellValue) !==
          0
      ) {
        issues.push(
          genIssue(
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
            [
              property.name,
              `<${[
                ...Array.from(
                  { length: childBusAddressValue },
                  () => "child-bus-address"
                ),
                ...Array.from(
                  { length: parentdBusAddressValue },
                  () => "parent-bus-address"
                ),
                ...Array.from(
                  { length: parentdBusAddressValue },
                  () => "length"
                ),
              ].join(" ")}>`,
            ]
          )
        );
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
