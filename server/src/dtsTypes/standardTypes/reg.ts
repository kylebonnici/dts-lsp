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
import { genIssue } from "../../helpers";
import { PropertyNodeType, PropertyType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
} from "./helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "reg",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
    (node) => {
      return node.address !== undefined ? "required" : "omitted";
    },
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const sizeCellProperty =
        property.parent.parent?.getProperty("#size-cells");
      const addressCellProperty =
        property.parent.parent?.getProperty("#address-cells");

      const sizeCell = sizeCellProperty
        ? getU32ValueFromProperty(sizeCellProperty, 0, 0) ?? 1
        : 1;
      const addressCell = addressCellProperty
        ? getU32ValueFromProperty(addressCellProperty, 0, 0) ?? 2
        : 2;

      if (values.length % (sizeCell + addressCell) !== 0) {
        issues.push(
          genIssue(
            StandardTypeIssue.CELL_MISS_MATCH,
            values[values.length - (values.length % (sizeCell + addressCell))],
            DiagnosticSeverity.Error,
            [],
            [],
            [
              property.name,
              `<${[
                ...Array.from({ length: addressCell }, () => "address"),
                ...Array.from({ length: sizeCell }, () => "cell"),
              ].join(" ")}>`,
            ]
          )
        );
        return issues;
      }

      for (let i = 0; i < values.length; i += sizeCell + addressCell) {
        const buffer = new ArrayBuffer(addressCell * 4);
        const view = new DataView(buffer);

        values
          .slice(0, addressCell)
          .map((_, i) => getU32ValueFromProperty(property, 0, i) ?? 0)
          .forEach((c, i) => {
            view.setUint32(i * 4, c);
          });

        if (
          property.parent.address &&
          ((addressCell === 2 &&
            view.getBigUint64(0) !== BigInt(property.parent.address)) ||
            (addressCell === 1 &&
              view.getUint32(0) !== property.parent.address))
        ) {
          issues.push(
            genIssue(
              StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
              property.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [property.name]
            )
          );
        }
      }

      return issues;
    }
  );
  prop.desctiption = [
    `The reg property describes the address of the device's resources within the address space defined by its parent bus. Most commonly this means the offsets and lengths of memory-mapped IO register blocks, but may have a different meaning on some bus types. Addresses in the address space defined by the root node are CPU real addresses.`,
    `The value is a <prop-encoded-array>, composed of an arbitrary number of pairs of address and length, <ad-dress length>. The number of <u32> cells required to specify the address and length are bus-specific and are specified by the #address-cells and #size-cells properties in the parent of the device node. If the parent node specifies a value of 0 for #size-cells, the length field in the value of reg shall be omitted.`,
  ];
  prop.examples = [
    "Suppose a device within a system-on-a-chip had two blocks of registers, a 32-byte block at offset 0x3000 in the SOC and a 256-byte block at offset OxFE00. The reg property would be encoded as follows (assuming #address-cells and #size-cells values of 1):",
    "```devicetree\nreg = <0x3000 0x20 0xFE00 0x100>;\n```",
  ];
  return prop;
};
