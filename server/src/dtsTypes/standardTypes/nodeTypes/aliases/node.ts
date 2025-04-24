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

import { BindingPropertyType } from "../../../../types/index";
import {
  genStandardTypeDiagnostic,
  toRangeWithTokenIndex,
} from "../../../../helpers";
import { NodeType, PropertyNodeType } from "../../../types";
import { generateOrTypeObj } from "../../helpers";
import { FileDiagnostic, StandardTypeIssue } from "../../../../types";
import { DiagnosticSeverity, TextEdit } from "vscode-languageserver";
import { Node } from "../../../../context/node";

export function getAliasesNodeType() {
  const nodeType = new NodeType((_, node) => {
    const issues: FileDiagnostic[] = [];
    if (node.parent?.name !== "/") {
      issues.push(
        genStandardTypeDiagnostic(
          StandardTypeIssue.NODE_LOCATION,
          node.definitions[0],
          DiagnosticSeverity.Error,
          node.definitions.slice(1),
          [],
          ["Aliases node can only be added to a root node"]
        )
      );
    }

    node.nodes.forEach((n) => {
      n.definitions.forEach((ast) => {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.NODE_LOCATION,
            ast,
            DiagnosticSeverity.Error,
            [],
            [],
            ["Aliases node can not have child nodes"],
            TextEdit.del(
              toRangeWithTokenIndex(
                ast.firstToken.prevToken,
                ast.lastToken,
                false
              )
            ),
            "Delete Node"
          )
        );
      });
    });

    return issues;
  });
  nodeType.noMismatchPropertiesAllowed = true;

  const prop = new PropertyNodeType<string | number>(
    (name) => {
      return !!name.match(/^[-A-Za-z0-9]+$/);
    },
    generateOrTypeObj([BindingPropertyType.STRING, BindingPropertyType.U32]),
    undefined,
    undefined,
    undefined,
    (property) => {
      const issues: FileDiagnostic[] = [];
      const values = property.ast.quickValues;
      if (values?.length === 1 && typeof values[0] === "string") {
        if (!values[0].startsWith("/")) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.UNABLE_TO_RESOLVE_PATH,
              property.ast.values ?? property.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [values[0], property.name]
            )
          );
          return issues;
        }
        if (values[0].trim().endsWith("/")) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.UNABLE_TO_RESOLVE_PATH,
              property.ast.values ?? property.ast,
              DiagnosticSeverity.Error,
              [],
              [],
              ["", values[0]]
            )
          );
          return issues;
        }
        let node: Node | undefined = property.parent.root;
        const path = values[0].split("/").slice(1);
        while (path[0]) {
          const lastNode: Node | undefined = node;
          const v = path.splice(0, 1)[0];
          const [name, addressStr] = v.split("@");
          const address = addressStr
            ?.split(",")
            .map((v) => Number.parseInt(v, 16));
          node = name ? lastNode.getNode(name, address, false) : undefined;
          if (!node) {
            issues.push(
              genStandardTypeDiagnostic(
                StandardTypeIssue.UNABLE_TO_RESOLVE_PATH,
                property.ast.values ?? property.ast,
                DiagnosticSeverity.Error,
                [],
                [],
                [name, lastNode.fullName]
              )
            );
            break;
          }
        }
      }
      return issues;
    }
  );
  prop.description = [`Each property of the /aliases node defines an alias.`];
  nodeType.addProperty([prop]);
  return nodeType;
}
