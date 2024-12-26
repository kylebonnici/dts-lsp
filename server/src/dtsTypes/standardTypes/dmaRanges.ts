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

import { ArrayValues } from "../../ast/dtc/values/arrayValue";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj, getU32ValueFromProperty } from "./helpers";
import { genIssue } from "../../helpers";
import { Issue, StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "dma-ranges",
    generateOrTypeObj([PropertyType.EMPTY, PropertyType.PROP_ENCODED_ARRAY]),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];
      const value = property.ast.values?.values.at(0)?.value;
      if (!(value instanceof ArrayValues)) {
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
        value.values.length %
          (childBusAddressValue + parentdBusAddressValue + sizeCellValue) !==
        0
      ) {
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
