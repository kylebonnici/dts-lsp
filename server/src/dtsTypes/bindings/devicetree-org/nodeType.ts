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

import Ajv, { ErrorObject } from "ajv";
import { StringValue } from "../../../ast/dtc/values/string";
import { Node } from "../../../context/node";
import { Runtime } from "../../../context/runtime";
import { INodeType } from "../../../dtsTypes/types";
import { genIssue, getIndentString } from "../../../helpers";
import { Issue, StandardTypeIssue } from "../../../types";
import {
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupContent,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { getNodeNameOrNodeLabelRef } from "../../../ast/helpers";
import { countParent } from "../../../getDocumentFormatting";

export class DevicetreeOrgNodeType extends INodeType {
  constructor(private ajv: Ajv, private schemaKey: string) {
    super();
  }

  childNodeType: INodeType | undefined;

  getIssue(runtime: Runtime, node: Node): Issue<StandardTypeIssue>[] {
    const issue: Issue<StandardTypeIssue>[] = [];

    const statusProperty = node.getProperty("status");
    const value = statusProperty?.ast.values?.values.at(0)?.value;
    if (value instanceof StringValue) {
      if (value.value === "disabled") {
        [...node.definitions, ...node.referencedBy].forEach((n) =>
          issue.push(
            genIssue(
              StandardTypeIssue.NODE_DISABLED,
              n,
              DiagnosticSeverity.Hint,
              [
                ...(statusProperty?.ast.parentNode
                  ? [statusProperty?.ast.parentNode]
                  : []),
              ],
              [DiagnosticTag.Unnecessary]
            )
          )
        );
        return issue;
      }
    }

    const nodeJson = Node.toJson(node);
    const validate = this.ajv.getSchema(this.schemaKey);
    try {
      if (!validate) {
        console.log("no validate");
      } else if (validate(nodeJson)) {
        console.log(
          this.schemaKey,
          `${node.path.join("/")}`,
          "validate",
          nodeJson
        );
      } else {
        validate.errors?.forEach((e) =>
          issue.push(...convertToError(runtime, e, node))
        );
        console.log(this.schemaKey, `${node.path.join("/")}`, validate.errors);
      }
    } catch (ee) {
      console.log(this.schemaKey, `${node.path.join("/")}`, this.schemaKey, ee);
    }

    return issue;
  }

  getOnPropertyHover(name: string): MarkupContent | undefined {
    // TODO
    return;
  }
}

const convertToError = (
  runtime: Runtime,
  error: ErrorObject<string, Record<string, any>, unknown>,
  node: Node
): Issue<StandardTypeIssue>[] => {
  if (error.keyword === "type") {
    // TODO JSON is not valid as is to check types.....
    const childPath = error.instancePath
      .split("/")
      .filter((v) => v)
      .slice(1);
    const intanceNode = childPath.length
      ? Runtime.getNodeFromPath(childPath, node, false)
      : node;

    if (!intanceNode) {
      console.warn("unable to find node intance", error);
      return [];
    }

    const prop = intanceNode.getProperty(error.instancePath.split("/")[1]);

    if (!prop) {
      console.warn("unable to find property in node", error);
      return [];
    }

    return [
      genIssue<StandardTypeIssue>(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        prop.ast,
        DiagnosticSeverity.Error,
        [],
        [],
        [`${prop.name} ${error.message ?? "NO MESSAGE"}`]
      ),
    ];
  } else if (error.keyword === "required") {
    const intanceNode = error.instancePath
      ? Runtime.getNodeFromPath(
          error.instancePath.split("/").filter((v) => v),
          node,
          false
        )
      : node;

    if (!intanceNode) {
      console.warn("unable to find node intance", error);
      return [];
    }
    const propertyName = error.params.missingProperty;

    const p = intanceNode.getProperty(propertyName);
    if (p) {
      return [
        genIssue<StandardTypeIssue>(
          StandardTypeIssue.EXPECTED_VALUE,
          p.ast,
          DiagnosticSeverity.Error,
          [],
          [],
          [`Binding expects property to have a value`]
        ),
      ];
    }
    const childOrRefNode = runtime.getOrderedNodeAst(intanceNode);
    const orderedTree = getNodeNameOrNodeLabelRef(childOrRefNode);

    return childOrRefNode.map((node, i) => {
      const token = node.openScope ?? orderedTree[i].lastToken;

      return genIssue<StandardTypeIssue>(
        StandardTypeIssue.REQUIRED,
        orderedTree[i],
        DiagnosticSeverity.Error,
        [],
        [],
        [propertyName],
        TextEdit.insert(
          Position.create(token.pos.line, token.pos.col + 1),
          `\n${"".padEnd(
            countParent(orderedTree[i].uri, node) * getIndentString().length,
            getIndentString()
          )}${propertyName};`
        )
      );
    });
  }

  return [
    genIssue(
      StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
      node.definitions[0],
      undefined,
      undefined,
      undefined,
      [error.message ?? "NO MESSAGE"]
    ),
  ];
};
