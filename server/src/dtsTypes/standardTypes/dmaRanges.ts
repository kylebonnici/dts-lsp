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
import { PropertyNodeType } from "../types";
import { flatNumberValues, generateOrTypeObj } from "./helpers";
import {
  findUniqueMappingOverlaps,
  genStandardTypeDiagnostic,
} from "../../helpers";
import { FileDiagnostic, StandardTypeIssue } from "../../types";
import {
  DiagnosticSeverity,
  ParameterInformation,
  SignatureInformation,
} from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType<number>(
    "dma-ranges",
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

      const args = [
        ...Array.from(
          { length: childBusAddressValue },
          (_, i) => `child-bus-address${childBusAddressValue > 1 ? i : ""}`
        ),
        ...Array.from(
          { length: parentdBusAddressValue },
          (_, i) => `parent-bus-address${parentdBusAddressValue > 1 ? i : ""}`
        ),
        ...Array.from(
          { length: sizeCellValue },
          (_, i) => `length${sizeCellValue > 1 ? i : ""}`
        ),
      ];
      prop.signatureArgs = args.map((arg) => ParameterInformation.create(arg));

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
                ...Array.from({ length: sizeCellValue }, () => "length"),
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
