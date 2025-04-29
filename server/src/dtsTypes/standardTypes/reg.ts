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
import { genStandardTypeDiagnostic } from "../../helpers";
import { PropertyNodeType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
} from "./helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType<number>(
    "reg",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    (node) => {
      return node.address !== undefined ? "required" : "omitted";
    },
    undefined,
    undefined,
    (property) => {
      const issues: FileDiagnostic[] = [];

      const values = flatNumberValues(property.ast.values);
      if (!values) {
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

      prop.typeExample = `<${[
        ...Array.from({ length: addressCell }, () => "address"),
        ...Array.from({ length: sizeCell }, () => "cell"),
      ].join(" ")}>`;

      if (
        values.length === 0 ||
        values.length % (sizeCell + addressCell) !== 0
      ) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.CELL_MISS_MATCH,
            values.at(
              values.length - (values.length % (sizeCell + addressCell))
            ) ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name, prop.typeExample]
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

        // TODO consider adding check and warn if property.parent.address?.length > 1 && property.parent.address?.length !== addressCell

        if (property.parent.address && property.parent.address?.length > 1) {
          property.parent.address?.forEach((a, i) => {
            if (view.getUint32(i * 4) !== a) {
              issues.push(
                genStandardTypeDiagnostic(
                  StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
                  property.ast,
                  DiagnosticSeverity.Error,
                  [],
                  [],
                  [property.name]
                )
              );
            }
          });
        } else if (
          property.parent.address?.length === 1 &&
          ((addressCell === 2 &&
            view.getBigUint64(0) !== BigInt(property.parent.address[0])) ||
            (addressCell === 1 &&
              view.getUint32(0) !== property.parent.address[0]))
        ) {
          issues.push(
            genStandardTypeDiagnostic(
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
  prop.examples = [
    "Suppose a device within a system-on-a-chip had two blocks of registers, a 32-byte block at offset 0x3000 in the SOC and a 256-byte block at offset OxFE00. The reg property would be encoded as follows (assuming #address-cells and #size-cells values of 1):",
    "```devicetree\nreg = <0x3000 0x20 0xFE00 0x100>;\n```",
  ];
  return prop;
};
