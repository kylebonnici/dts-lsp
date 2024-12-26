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
import { generateOrTypeObj, getU32ValueFromProperty } from "./helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

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
      const value = property.ast.values?.values.at(0)?.value;
      if (!(value instanceof ArrayValues)) {
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

      if (value.values.length % (sizeCell + addressCell) !== 0) {
        issues.push(
          genIssue(
            StandardTypeIssue.CELL_MISS_MATCH,
            value,
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

      const buffer = new ArrayBuffer(addressCell * 4);
      const view = new DataView(buffer);

      value.values
        .slice(0, addressCell)
        .map((_, i) => getU32ValueFromProperty(property, 0, i) ?? 0)
        .forEach((c, i) => {
          view.setUint32(i * 4, c);
        });

      if (
        property.parent.address &&
        ((addressCell === 2 &&
          view.getBigUint64(0) !== BigInt(property.parent.address)) ||
          (addressCell === 1 && view.getUint32(0) !== property.parent.address))
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

      return issues;
    }
  );
  return prop;
};
