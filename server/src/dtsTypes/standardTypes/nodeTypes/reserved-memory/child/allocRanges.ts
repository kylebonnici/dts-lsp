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
import { DiagnosticSeverity } from "vscode-languageserver-types";

export default () => {
  const prop = new PropertyNodeType(
    "alloc-ranges",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property, macros) => {
      const issues: FileDiagnostic[] = [];

      const values = flatNumberValues(property.ast.values);

      prop.typeExample = `<${Array.from(
        {
          length: property.parent.addressCells(macros),
        },
        () => "address"
      )} ${Array.from(
        {
          length: property.parent.sizeCells(macros),
        },
        () => "size"
      )}>`;

      if (
        values?.length !==
        property.parent.addressCells(macros) + property.parent.sizeCells(macros)
      ) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.CELL_MISS_MATCH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name, prop.typeExample]
          )
        );
      }

      return issues;
    }
  );
  prop.description = [
    `Specifies regions of memory that are acceptable to allocate from`,
  ];

  return prop;
};
