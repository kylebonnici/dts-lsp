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

import { StringValue } from "../../ast/dtc/values/string";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { StandardTypeIssue } from "../../types";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "device_type",
    generateOrTypeObj(PropertyType.STRING),
    (node) => {
      return node.name === "cpu" || node.name === "memory"
        ? "optional"
        : "omitted";
    },
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
          value.value.slice(1, -1) !== property.parent.name
        ) {
          return property.parent.name === "cpu"
            ? [
                genIssue(
                  StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU,
                  property.ast,
                  DiagnosticSeverity.Error,
                  [],
                  [],
                  [property.name]
                ),
              ]
            : [
                genIssue(
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
      return [];
    }
  );
