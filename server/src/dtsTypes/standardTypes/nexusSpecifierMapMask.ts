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

import { genStandardTypeDiagnostic } from "../../helpers";
import { FileDiagnostic, StandardTypeIssue } from "../../types";
import { BindingPropertyType } from "../../types/index";
import { PropertyNodeType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  getU32ValueFromProperty,
} from "./helpers";
import {
  DiagnosticSeverity,
  ParameterInformation,
} from "vscode-languageserver-types";

export default () => {
  const prop = new PropertyNodeType<number>(
    /^(?!interrupt-).*?-map-mask$/,
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    undefined,
    (property, macros) => {
      const issues: FileDiagnostic[] = [];
      const node = property.parent;

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const specifier = property.name.split("-map", 1)[0];
      const childSpecifierCells = node.getProperty(`#${specifier}-cells`);

      if (!childSpecifierCells) {
        return issues;
      }

      const childInterruptSpecifierValue = getU32ValueFromProperty(
        childSpecifierCells,
        0,
        0,
        macros
      );

      if (childInterruptSpecifierValue == null) {
        return issues;
      }

      const args = [
        ...Array.from(
          { length: childInterruptSpecifierValue },
          (_, i) => `mask${childInterruptSpecifierValue > 1 ? i : ""}`
        ),
      ];
      prop.signatureArgs = args.map((arg) => ParameterInformation.create(arg));

      if (values.length !== childInterruptSpecifierValue) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.CELL_MISS_MATCH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [
              property.name,
              `<${[
                ...Array.from(
                  { length: childInterruptSpecifierValue },
                  () => "mask"
                ),
              ].join(" ")}>`,
            ]
          )
        );
        return issues;
      }

      return issues;
    }
  );

  prop.description = [
    "A `<specifier>-map-mask` property may be specified for a nexus node. This property specifies a mask that is ANDed with the child unit specifier being looked up in the table specified in the `<specifier>-map` property. If this propertyis notspecified, the maskis assumedto be a mask with all bits set.",
  ];
  return prop;
};
