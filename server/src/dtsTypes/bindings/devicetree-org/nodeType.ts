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
import {
  genIssue,
  getIndentString,
  toRangeWithTokenIndex,
} from "../../../helpers";
import { Issue, StandardTypeIssue } from "../../../types";
import {
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupContent,
  MarkupKind,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { getNodeNameOrNodeLabelRef } from "../../../ast/helpers";
import { countParent } from "../../../getDocumentFormatting";
import { DtcRootNode } from "../../../ast/dtc/node";
import { Property } from "../../../context/property";
import { AnyValidateFunction } from "ajv/dist/core";

export class DevicetreeOrgNodeType extends INodeType {
  private validate: AnyValidateFunction<unknown> | undefined;
  constructor(private ajv: Ajv, private schemaKey: string) {
    super();
    this.validate = this.ajv.getSchema(this.schemaKey);
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
    try {
      if (!this.validate) {
        console.log("no validate");
      } else if (this.validate(nodeJson)) {
        console.log(
          this.schemaKey,
          `${node.path.join("/")}`,
          "validate",
          nodeJson
        );
      } else {
        this.validate.errors?.forEach((e) =>
          issue.push(...convertToError(runtime, e, node, this.schemaKey))
        );
        console.log(
          this.schemaKey,
          `${node.path.join("/")}`,
          this.validate.errors
        );
      }
    } catch (ee) {
      console.log(this.schemaKey, `${node.path.join("/")}`, this.schemaKey, ee);
    }

    return issue;
  }

  getOnPropertyHover(name: string): MarkupContent | undefined {
    const prop = (this.validate?.schema as any).properties?.[name];
    if (prop && "description" in prop) {
      return {
        kind: MarkupKind.Markdown,
        value: [
          ...(prop.description
            ? [
                "### Description",
                Array.isArray(prop.description)
                  ? prop.description.join("\n\n")
                  : prop.description,
              ]
            : []),
        ].join("\n"),
      };
    }

    return;
  }

  getPropertyListCompletionItems(node: Node) {
    const propNames = Object.keys((this.validate?.schema as any).properties);
    const requiredProps = (this.validate?.schema as any).required as string[];
    return (
      propNames.map((p) => {
        const required = node && requiredProps.some((v) => v === p);
        const hasProperty = !!node.property.some((pp) => p === pp.name);
        let sortLetter = "a";
        if (required) {
          sortLetter = hasProperty ? "Y" : "A";
        } else {
          sortLetter = hasProperty ? "Z" : "B";
        }

        return {
          label: `${p}`,
          kind: CompletionItemKind.Property,
          sortText: `${sortLetter}${p}`,
        };
      }) ?? []
    );
  }
}

const convertToError = (
  runtime: Runtime,
  error: ErrorObject<string, Record<string, any>, unknown>,
  node: Node,
  schemaKey: string
): Issue<StandardTypeIssue>[] => {
  const meta = getMeta(node, error.instancePath);

  const intanceNode = meta.node;

  if (error.keyword === "additionalProperties") {
    const property = intanceNode.getProperty(error.params.additionalProperty);

    if (!property) {
      return [];
    }
    return [
      genIssue<StandardTypeIssue>(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        property.ast,
        DiagnosticSeverity.Error,
        [],
        [],
        [`Node "${intanceNode.name}" ${error.message}: ${property.name}`],
        TextEdit.del(
          toRangeWithTokenIndex(
            property.ast.firstToken.prevToken,
            property.ast.lastToken,
            false
          )
        ),
        "Remove property"
      ),
    ];
  } else if (error.keyword === "type") {
    // TODO JSON is not valid as is to check types.....
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
        [`"${prop.name}" ${error.message ?? "NO MESSAGE"}`]
      ),
    ];
  } else if (error.keyword === "required") {
    const propertyName = error.params.missingProperty;

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
  } else if (error.keyword === "const") {
    const property = meta.property;
    if (!property) {
      return [];
    }

    return [
      genIssue<StandardTypeIssue>(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        property.ast,
        DiagnosticSeverity.Error,
        [],
        [],
        [
          `Property "${property.name}" ${error.message}: ${error.params.allowedValue}`,
        ]
      ),
    ];
  } else if (error.keyword === "enum") {
    const property = meta.property;
    if (!property) {
      return [];
    }

    return [
      genIssue<StandardTypeIssue>(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        property.ast,
        DiagnosticSeverity.Error,
        [],
        [],
        [
          `Property "${property.name}" ${error.message}: \n${(
            error.params.allowedValues as string[]
          ).join("\n")}\n${schemaKey}`,
        ]
      ),
    ];
  } else if (error.keyword === "maxItems" || error.keyword === "minItems") {
    const property = intanceNode.getProperty(
      error.instancePath.split("/").at(-1) ?? ""
    );

    if (!property) {
      return [];
    }

    return [
      genIssue<StandardTypeIssue>(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        property.ast,
        DiagnosticSeverity.Error,
        [],
        [],
        [`Property "${property.name}" ${error.message}`]
      ),
    ];
  }
  // fallback
  if (meta.property) {
    return [
      genIssue(
        StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
        meta.property.ast,
        undefined,
        undefined,
        undefined,
        [
          `TODO: Node "${intanceNode.name} ${
            error.message ?? "NO MESSAGE"
          }: \n${JSON.stringify(error)}\n${schemaKey}`,
        ]
      ),
    ];
  }

  return [
    genIssue(
      StandardTypeIssue.DEVICETREE_ORG_BINDINGS,
      meta.node.definitions[0] instanceof DtcRootNode
        ? meta.node.definitions[0]
        : meta.node.definitions[0].name ?? meta.node.definitions[0],
      undefined,
      undefined,
      undefined,
      [
        `TODO: Node "${intanceNode.name} ${
          error.message ?? "NO MESSAGE"
        }: \n${JSON.stringify(error)}\n${schemaKey}`,
      ]
    ),
  ];
};

const getMeta = (node: Node, instancePath: string) => {
  return traveseNodeWithInstancePath(
    node,
    instancePath.split("/").filter((v) => v)
  );
};

const traveseNodeWithInstancePath = (
  node: Node,
  instancePath: string[]
): {
  node: Node;
  property?: Property;
  remainingInstancePath: string;
} => {
  if (instancePath.length === 0) {
    return {
      node: node,
      remainingInstancePath: "",
    };
  }

  const split = instancePath[0].split("@");
  const name = split[0];
  const address = split
    .at(1)
    ?.split(",")
    .map((v) => Number.parseInt(v, 16));
  const childNode = node.getNode(name, address);
  if (!childNode) {
    return {
      node,
      property: node.getProperty(instancePath[0]),
      remainingInstancePath: instancePath.slice(1).join("/"),
    };
  }

  return traveseNodeWithInstancePath(childNode, instancePath.slice(1));
};
