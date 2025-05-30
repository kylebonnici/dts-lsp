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
import { StringValue } from "../../ast/dtc/values/string";
import { PropertyNodeType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { StandardTypeIssue } from "../../types";
import { genStandardTypeDiagnostic } from "../../helpers";
import { DiagnosticSeverity, DiagnosticTag } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "device_type",
    generateOrTypeObj(BindingPropertyType.STRING),
    "optional",
    undefined,
    (property) => {
      if (property.parent.name === "cpu" || property.parent.name === "memory") {
        return [property.parent.name];
      }
      return [];
    },
    (property) => {
      if (property.parent.name === "cpu" || property.parent.name === "memory") {
        const value = property.ast.values?.values.at(0)?.value;
        if (
          value instanceof StringValue &&
          value.value !== property.parent.name
        ) {
          return property.parent.name === "cpu"
            ? [
                genStandardTypeDiagnostic(
                  StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU,
                  property.ast,
                  DiagnosticSeverity.Error,
                  [],
                  [],
                  [property.name]
                ),
              ]
            : [
                genStandardTypeDiagnostic(
                  StandardTypeIssue.EXPECTED_DEVICE_TYPE_MEMORY,
                  property.ast,
                  DiagnosticSeverity.Error,
                  [],
                  [],
                  [property.name]
                ),
              ];
        }
      }

      if (prop.required(property.parent) !== "required") {
        return [
          genStandardTypeDiagnostic(
            StandardTypeIssue.DEPRECATED,
            property.ast,
            DiagnosticSeverity.Hint,
            [],
            [DiagnosticTag.Deprecated],
            [property.name]
          ),
        ];
      }

      return [];
    }
  );
  prop.description = [
    "The device_type property was used in IEEE 1275 to describe the device's FCode programming model. Because DTSpec does not have FCode, new use of the property is deprecated, and it should be included only on cpu and memory nodes for compatibility with IEEE 1275-derived devicetrees.",
  ];
  return prop;
};
