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

import { PropertyNodeType, PropertyType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
} from "./helpers";
import { genIssue } from "../../helpers";
import { Issue, StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "dma-ranges",
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
    `The dma-ranges property is used to describe the direct memory access (DMA) structure of a memory-mapped bus whose devicetree parent can be accessed from DMA operations originating from the bus. It provides a means of defining a mapping or translation between the physical address space of the bus and the physical address space of the parent of the bus.`,
    "The format of the value of the dma-ranges property is an arbitrary number of triplets of (child-bus-address, parent-bus-address, length). Each triplet specified describes a contiguous DMA address range.",
    "- The child-bus-address is a physical address within the child bus' address space. The number of cells to represent the address depends on the bus and can be determined from the #address-cells of this node (the node in which the dma-ranges property appears).",
    "- The parent-bus-address is a physical address within the parent bus' address space. The number of cells to represent the parent address is bus dependent and can be determined from the #address-cells property of the node that defines the parent's address space.",
    "- The length specifies the size of the range in the child's address space. The number of cells to represent the size can be determined from the #size-cells of this node (the node in which the dma-ranges property appears).",
  ];
  return prop;
};
