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

import { genStandardTypeDiagnostic } from "../../../../helpers";
import { getU32ValueFromProperty } from "../../helpers";
import { StandardTypeIssue } from "../../../../types";
import { DiagnosticSeverity } from "vscode-languageserver";
import { getStandardDefaultType } from "../../../../dtsTypes/standardDefaultType";

export function getCpusNodeType() {
  const nodeType = getStandardDefaultType();
  nodeType.additionalValidations = (_, node) => {
    if (node.parent?.name !== "/") {
      return [
        genStandardTypeDiagnostic(
          StandardTypeIssue.NODE_LOCATION,
          node.definitions[0],
          DiagnosticSeverity.Error,
          node.definitions.slice(1),
          [],
          ["Cpus node can only be added to a root node"]
        ),
      ];
    }
    return [];
  };

  const addressCellsProp = nodeType.properties.find(
    (p) => p.name === "#address-cells"
  );
  addressCellsProp!.required = () => {
    return "required";
  };

  const sizeCellsProp = nodeType.properties.find(
    (p) => p.name === "#size-cells"
  );
  sizeCellsProp!.required = () => {
    return "required";
  };

  const sizeCellsAdditionalTypeCheck = sizeCellsProp?.additionalTypeCheck;
  sizeCellsProp!.additionalTypeCheck = (property, macros) => {
    const issues = sizeCellsAdditionalTypeCheck?.(property, macros) ?? [];

    const node = property.parent.getProperty(property.name);
    const nodeValue = node ? getU32ValueFromProperty(node, 0, 0) : undefined;

    if (nodeValue !== 0) {
      issues.push(
        genStandardTypeDiagnostic(
          StandardTypeIssue.INVALID_VALUE,
          property.ast,
          DiagnosticSeverity.Error,
          undefined,
          undefined,
          [`${property.name} value in cpus node must be '0'`]
        )
      );
    }

    return issues;
  };

  return nodeType;
}
