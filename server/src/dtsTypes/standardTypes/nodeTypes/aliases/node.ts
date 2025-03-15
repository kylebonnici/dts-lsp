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

import { genIssue } from "../../../../helpers";
import { NodeType, PropertyNodeType, PropertyType } from "../../../types";
import { generateOrTypeObj } from "../../helpers";
import { StandardTypeIssue } from "../../../../types";
import { DiagnosticSeverity } from "vscode-languageserver";

export function getAliasesNodeType() {
  const nodeType = new NodeType((_, node) => {
    if (node.parent?.name !== "/") {
      return [
        genIssue(
          StandardTypeIssue.NODE_LOCATION,
          node.definitions[0],
          DiagnosticSeverity.Error,
          node.definitions.slice(1),
          [],
          ["Aliases node can only be added to a root node"]
        ),
      ];
    }
    return [];
  });
  nodeType.allPropertiesMustMatch = true;

  const prop = new PropertyNodeType(
    (name) => {
      return !!name.match(/^[-A-Za-z0-9]+$/);
    },
    generateOrTypeObj([PropertyType.STRING, PropertyType.U32])
    // undefined,
    // undefined,
    // undefined,
    // (property) => {
    //   const value = property.ast.values?.values.at(0)?.value;
    //   if (value instanceof StringValue) {
    //     const path = value.value.split('/');
    //     if (property.parent.root.)
    //   }

    //   return [];
    // }
  );
  prop.description = [`Each property of the /aliases node defines an alias.`];
  nodeType.addProperty([prop]);
  return nodeType;
}
