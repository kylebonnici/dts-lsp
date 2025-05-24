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

import { genStandardTypeDiagnostic } from "../../../../../helpers";
import { FileDiagnostic, StandardTypeIssue } from "../../../../../types";
import { BindingPropertyType } from "../../../../../types/index";
import { PropertyNodeType } from "../../../../types";
import { flatNumberValues, generateOrTypeObj } from "../../../helpers";
import {
  DiagnosticSeverity,
  ParameterInformation,
} from "vscode-languageserver-types";

export default () => {
  const prop = new PropertyNodeType(
    "alignment",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property, macros) => {
      const issues: FileDiagnostic[] = [];

      const values = flatNumberValues(property.ast.values);

      const sizeCells = property.parent.sizeCells(macros);
      const args = [
        ...Array.from(
          { length: sizeCells },
          (_, i) => `size${sizeCells > 1 ? i : ""}`
        ),
      ];
      prop.signatureArgs = args.map((arg) => ParameterInformation.create(arg));

      if (values?.length !== sizeCells) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.CELL_MISS_MATCH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [
              property.name,
              `<${Array.from(
                {
                  length: property.parent.sizeCells(macros),
                },
                () => "size"
              )}>`,
            ]
          )
        );
      }

      return issues;
    }
  );
  prop.description = [`Address boundary for alignment of allocation.`];

  return prop;
};
