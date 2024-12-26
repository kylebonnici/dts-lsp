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
import { generateOrTypeObj } from "./helpers";
import { genIssue } from "../../helpers";
import { StandardTypeIssue } from "../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType(
    "dma-ranges",
    generateOrTypeObj([PropertyType.EMPTY, PropertyType.PROP_ENCODED_ARRAY]),
    "optional",
    undefined,
    [],
    (property) => {
      const value = property.ast.values?.values.at(0)?.value;
      if (!(value instanceof ArrayValues)) {
        return [];
      }

      return value.values.length % 3 === 0
        ? []
        : [
            genIssue(
              StandardTypeIssue.EXPECTED_TRIPLETS,
              property.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [property.name]
            ),
          ];
    }
  );
