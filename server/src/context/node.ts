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

import {
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "../ast/dtc/node";
import {
  ContextIssues,
  FileDiagnostic,
  MacroRegistryItem,
  SearchableResult,
} from "../types";
import { Property } from "./property";
import { DeleteProperty } from "../ast/dtc/deleteProperty";
import { DeleteNode } from "../ast/dtc/deleteNode";
import {
  genContextDiagnostic,
  getDeepestAstNodeAfter,
  getDeepestAstNodeBefore,
  getDeepestAstNodeInBetween,
  positionInBetween,
  positionSameLineAndNotAfter,
} from "../helpers";
import {
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupContent,
  MarkupKind,
  Position,
} from "vscode-languageserver";
import { LabelAssign } from "../ast/dtc/label";
import { ASTBase } from "../ast/base";
import { DeleteBase } from "../ast/dtc/delete";
import { LabelRef } from "../ast/dtc/labelRef";
import { NumberValue } from "../ast/dtc/values/number";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { getNodeNameOrNodeLabelRef } from "../ast/helpers";
import { getStandardType } from "../dtsTypes/standardTypes";
import { BindingLoader } from "../dtsTypes/bindings/bindingLoader";
import { INodeType, NodeType } from "../dtsTypes/types";
import { SerializedBinding, SerializedNode } from "../types/index";

export class Node {
  public referencedBy: DtcRefNode[] = [];
  public definitions: (DtcChildNode | DtcRootNode)[] = [];
  private _properties: Property[] = [];
  private _deletedProperties: { property: Property; by: DeleteProperty }[] = [];
  private _deletedNodes: { node: Node; by: DeleteNode }[] = [];
  public deletes: DeleteBase[] = [];
  private _nodes: Node[] = [];
  linkedNodeNamePaths: NodeName[] = [];
  linkedRefLabels: LabelRef[] = [];

  private _nodeTypes: INodeType[] | undefined;

  static toJson(node: Node) {
    const obj: any = {};
    node.property.forEach(
      (p) => (obj[p.name] = p.ast.values?.toJson() ?? true)
    );
    node.nodes.forEach((n) => (obj[n.fullName] = Node.toJson(n)));

    return obj;
  }

  constructor(
    public readonly bindingLoader: BindingLoader | undefined,
    public readonly name: string,
    public readonly address?: number[],
    public readonly parent: Node | null = null
  ) {
    parent?.addNode(this);
  }

  get nodeTypes(): INodeType[] {
    if (this._nodeTypes) {
      return this._nodeTypes;
    }

    const childType = this.parent?.nodeType?.childNodeType?.(this);

    if (childType) {
      this._nodeTypes = [childType];
      return this._nodeTypes;
    }

    this._nodeTypes = [getStandardType(this)];
    return this._nodeTypes;
  }

  get nodeType(): INodeType | undefined {
    return this.nodeTypes.find(
      (t) => !t.onBus || this.parent?.nodeType?.bus?.some((b) => b === t.onBus)
    );
  }

  isChildOf(node: Node): boolean {
    if (!this.parent) {
      return false;
    }
    return this.parent === node ? true : this.parent.isChildOf(node);
  }

  public getReferenceBy(node: DtcRefNode): Node | undefined {
    if (this.referencedBy.some((n) => n === node)) {
      return this;
    }

    return [...this._nodes, ...this._deletedNodes.map((n) => n.node)]
      .map((n) => n.getReferenceBy(node))
      .find((n) => n);
  }

  get nodeNameOrLabelRef(): (NodeName | LabelRef)[] {
    return getNodeNameOrNodeLabelRef([
      ...this.definitions,
      ...this.referencedBy,
    ]);
  }

  getDeepestAstNode(
    file: string,
    position: Position
  ): Omit<SearchableResult, "runtime"> | undefined {
    const inNode = [...this.definitions, ...this.referencedBy].find((i) =>
      positionInBetween(i, file, position)
    );

    if (inNode) {
      const inDeletes = this.deletes
        .map((p) => ({
          item: this,
          ast: getDeepestAstNodeInBetween(p, file, position),
          beforeAst: getDeepestAstNodeBefore(p, file, position),
          afterAst: getDeepestAstNodeAfter(p, file, position),
        }))
        .find((i) => positionInBetween(i.ast, file, position));

      if (inDeletes) {
        return inDeletes;
      }

      const inProperty = [
        ...this._properties.flatMap((p) => [p, ...p.allReplaced]),
        ...this._deletedProperties.flatMap((d) => [
          d.property,
          ...d.property.allReplaced,
        ]),
      ]
        .map((p) => ({
          item: p,
          ast: p.ast,
        }))
        .find(
          (i) =>
            positionInBetween(i.ast, file, position) ||
            (i.ast.lastToken.value !== ";" &&
              positionSameLineAndNotAfter(i.ast, file, position))
        );

      if (inProperty) {
        return inProperty.item.getDeepestAstNode(file, position);
      }

      const inChildNode = [
        ...this._nodes,
        ...this._deletedNodes.map((d) => d.node),
      ]
        .map((n) => n.getDeepestAstNode(file, position))
        .find((i) => i);

      if (inChildNode) {
        return inChildNode;
      }

      const deepestAstNode = getDeepestAstNodeInBetween(inNode, file, position);

      return {
        item: this,
        ast: deepestAstNode,
        beforeAst: getDeepestAstNodeBefore(deepestAstNode, file, position),
        afterAst: getDeepestAstNodeAfter(deepestAstNode, file, position),
      };
    }

    return;
  }

  get labels(): LabelAssign[] {
    return [
      ...this.referencedBy.flatMap((r) => r.labels),
      ...(
        this.definitions.filter(
          (def) => def instanceof DtcChildNode
        ) as DtcChildNode[]
      ).flatMap((def) => def.labels),
    ];
  }

  get labelsMapped() {
    return this.labels.map((l) => ({
      label: l,
      owner: this,
    }));
  }

  get allBindingsProperties(): Property[] {
    return [
      ...this.property.filter((p) => p.name === "compatible"),
      ...this._nodes.flatMap((n) => n.allBindingsProperties),
    ];
  }

  get allDescendantsLabels(): LabelAssign[] {
    return [
      ...this.labels,
      ...this._nodes.flatMap((n) => n.allDescendantsLabels),
    ];
  }

  get allDescendantsLabelsMapped(): {
    label: LabelAssign;
    owner: Property | Node | null;
  }[] {
    return [
      ...this.labelsMapped,
      ...this.property.flatMap((p) => p.labelsMapped),
      ...this._nodes.flatMap((n) => n.allDescendantsLabelsMapped),
    ];
  }

  get issues(): FileDiagnostic[] {
    const issues = [
      ...this.property.flatMap((p) => p.issues),
      ...this._nodes.flatMap((n) => n.issues),
      ...this._deletedNodes.flatMap((n) => n.node.issues),
      ...this.deletedPropertiesIssues,
      ...this.deletedNodesIssues,
    ];
    if (this.name === "/" && this.definitions.length) {
      if (!this._nodes.some((n) => n.name === "cpus")) {
        issues.push(
          genContextDiagnostic(
            ContextIssues.MISSING_NODE,
            this.definitions.at(-1)!,
            DiagnosticSeverity.Error,
            this.definitions.slice(0, -1),
            undefined,
            ["/", "cpus"]
          )
        );
      }
      // TODO look into this as zephyr boards do not have this node in root all the time
      // if (!this._nodes.some((n) => n.name === "memory")) {
      //   issues.push(
      //     genIssue(
      //       ContextIssues.MISSING_NODE,
      //       this.definitions.at(-1)!,
      //       DiagnosticSeverity.Error,
      //       this.definitions.slice(0, -1),
      //       undefined,
      //       ["/", "memory"]
      //     )
      //   );
      // }
    }
    return issues;
  }

  get deletedPropertiesIssues(): FileDiagnostic[] {
    return [
      ...this._deletedProperties.flatMap((meta) => [
        genContextDiagnostic(
          ContextIssues.DELETE_PROPERTY,
          meta.property.ast,
          DiagnosticSeverity.Hint,
          [meta.by],
          [DiagnosticTag.Deprecated],
          [meta.property.name]
        ),
        ...meta.property.allReplaced.map((p) =>
          genContextDiagnostic(
            ContextIssues.DELETE_PROPERTY,
            p.ast,
            DiagnosticSeverity.Hint,
            [meta.by],
            [DiagnosticTag.Deprecated],
            [meta.property.name]
          )
        ),
        ...meta.property.issues,
      ]),
    ];
  }

  get deletedNodesIssues(): FileDiagnostic[] {
    return this._deletedNodes.flatMap((meta) => [
      ...[
        ...(meta.node.definitions.filter(
          (node) => node instanceof DtcChildNode
        ) as DtcChildNode[]),
        ...meta.node.referencedBy,
      ].flatMap((node) =>
        genContextDiagnostic(
          ContextIssues.DELETE_NODE,
          node,
          DiagnosticSeverity.Hint,
          [meta.by],
          [DiagnosticTag.Deprecated],
          [
            node instanceof DtcChildNode
              ? node.name!.toString()
              : node.labelReference!.label!.value,
          ]
        )
      ),
    ]);
  }

  get path(): string[] {
    return this.parent ? [...this.parent.path, this.fullName] : [this.fullName];
  }

  get pathString(): string {
    return `/${this.path.slice(1).join("/")}`;
  }

  get property() {
    return this._properties;
  }

  get deletedProperties() {
    return this._deletedProperties;
  }

  get nodes() {
    return this._nodes;
  }

  get deletedNodes() {
    return this._deletedNodes;
  }

  get propertyNames() {
    return this._properties.map((property) => property.name);
  }

  hasNode(name: string, address?: number[]) {
    return this._nodes.some(
      (node) =>
        node.name === name &&
        (node.address === address ||
          node.address?.every((a, i) => address?.at(i) === a))
    );
  }

  hasProperty(name: string) {
    return this._properties.some((property) => property.name === name);
  }

  getProperty(name: string) {
    return this._properties.find((property) => property.name === name);
  }

  deleteNode(name: string, by: DeleteNode, address?: number[]) {
    const index = this._nodes.findIndex(
      (node) =>
        node.name === name &&
        (node.address === address ||
          address?.every((a, i) => node.address?.at(i) === a))
    );
    if (index === -1) return;

    this._deletedNodes.push({
      node: this._nodes[index],
      by,
    });

    this._nodes.splice(index, 1);
  }

  get root(): Node {
    return this.parent ? this.parent.root : this;
  }

  getAllPhandle(id: number): Node[] {
    const phandleValue =
      this.getProperty("phandle")?.ast.values?.values.at(0)?.value;

    if (phandleValue instanceof ArrayValues) {
      const value = phandleValue.values[0].value;
      if (value instanceof NumberValue && value.value === id) {
        return [this, ...this._nodes.flatMap((n) => n.getAllPhandle(id))];
      }
    }

    return this._nodes.flatMap((n) => n.getAllPhandle(id));
  }

  getPhandle(id: number): Node | undefined {
    const phandleValue =
      this.getProperty("phandle")?.ast.values?.values.at(0)?.value;

    if (phandleValue instanceof ArrayValues) {
      const value = phandleValue.values[0].value;
      if (value instanceof NumberValue && value.value === id) {
        return this;
      }
    }

    return this._nodes.flatMap((n) => n.getPhandle(id)).find((n) => !!n);
  }

  getNode(name: string, address?: number[], strict = true) {
    const isAddressNeeded =
      strict ||
      !!address ||
      this._nodes.filter((node) => node.name === name).length > 1;
    const index = this._nodes.findIndex(
      (node) =>
        node.name === name &&
        (!isAddressNeeded ||
          node.address === address ||
          node.address?.every((a, i) => address?.at(i) === a))
    );
    if (index === -1) return;

    return this._nodes[index];
  }

  deleteProperty(name: string, by: DeleteProperty) {
    const index = this._properties.findIndex(
      (property) => property.name === name
    );
    if (index === -1) return;

    this._deletedProperties.push({
      property: this._properties[index],
      by,
    });

    this._properties.splice(index, 1);
  }

  addNode(node: Node) {
    this._nodes.push(node);
  }

  addProperty(property: Property) {
    const index = this._properties.findIndex((p) => p.name === property.name);
    if (index === -1) {
      this._properties.push(property);
    } else {
      const replaced = this._properties.splice(index, 1)[0];
      this._properties.push(property);
      property.replaces = replaced;
      replaced.replacedBy = property;
    }

    if (property.name === "compatible") {
      if (this.bindingLoader) {
        this.bindingLoader
          .getNodeTypes(this)
          .then((t) => (this._nodeTypes = t));
      } else {
        this._nodeTypes = [getStandardType(this)];
      }
    }
  }

  getChild(path: string[], strict = true): Node | undefined {
    const copy = [...path];
    copy.splice(0, 1);
    const split = copy[0].split("@");
    const name = split[0];
    const address =
      split[1] !== undefined
        ? split[1].split(",").map((v) => Number.parseInt(v, 16))
        : undefined;
    const myChild = this.getNode(name, address, strict);
    if (copy.length === 1 || !myChild) return myChild;

    return myChild.getChild(copy);
  }

  getChildFromScope(
    path: string[],
    inScope: (ast: ASTBase) => boolean
  ): Node | undefined {
    if (path.length === 1 && path[0] === this.fullName) return this;
    if (path[0] !== this.fullName) return undefined;
    const copy = [...path];
    copy.splice(0, 1);
    const myChild = [
      ...this._nodes,
      ...this._deletedNodes.filter((n) => !inScope(n.by)).map((n) => n.node),
    ].find((node) => node.fullName === copy[0]);
    return myChild?.getChildFromScope(copy, inScope);
  }

  get fullName() {
    if (this.address !== undefined) {
      return `${this.name}@${this.address
        .map((v) => v.toString(16))
        .join(",")}`;
    }

    return this.name;
  }

  toTooltipString(macros: Map<string, MacroRegistryItem>) {
    return `${this.labels.map((l) => l.toString()).join(" ")}${
      this.labels.length ? " " : ""
    }${this.fullName} {${this.property.length ? "\n\t" : ""}${this.property
      .map((p) => p.toPrettyString(macros))
      .join("\n\t")}${
      this.nodes.length
        ? `\n\t${this.nodes
            .map((n) => `${n.fullName}{ /* ... */ };`)
            .join("\n\t")}`
        : ""
    } 
};`;
  }

  toMarkupContent(macros: Map<string, MacroRegistryItem>): MarkupContent {
    return {
      kind: MarkupKind.Markdown,
      value: [
        "### Path",
        this.pathString,
        "### Current State",
        "```devicetree",
        this.toTooltipString(macros),
        "```",
        ...(this.nodeType?.maintainers
          ? ["### Maintainers", ...(this.nodeType?.maintainers ?? [])]
          : []),
        ...(this.nodeType?.description
          ? ["### Description", this.nodeType?.description]
          : []),
        ...(this.nodeType?.examples
          ? [
              "### Examples",
              "```devicetree",
              ...(this.nodeType?.examples ?? []),
              "```",
            ]
          : []),
      ].join("\n"),
    };
  }

  toFullString(macros: Map<string, MacroRegistryItem>, level = 1): string {
    const hasOmitIfNoRef = this.definitions.some(
      (d) => d instanceof DtcChildNode && d.omitIfNoRef
    );
    const isOmmited =
      hasOmitIfNoRef &&
      this.linkedRefLabels.length === 0 &&
      this.linkedNodeNamePaths.length === 0;

    if (isOmmited) {
      return `/* /omit-if-no-ref/ ${this.labels
        .map((l) => l.toString())
        .join(" ")}${this.labels.length ? " " : ""}${this.fullName} {${
        this.property.length ? `\n${"\t".repeat(level)}` : ""
      }${this.property
        .map((p) => p.toString())
        .join(`\n${"\t".repeat(level)}`)}${
        this.nodes.length
          ? `\n${"\t".repeat(level)}${this.nodes
              .map((n) => `${n.fullName}{ ... };`)
              .join(`\n${"\t".repeat(level)}`)}`
          : ""
      } 
${"\t".repeat(level - 1)}}; */`;
    }

    return `${
      isOmmited
        ? "/* /omit-if-no-ref/ "
        : hasOmitIfNoRef
        ? `/* /omit-if-no-ref/ */\n${"\t".repeat(level - 1)}`
        : ""
    }${this.labels.map((l) => l.toString()).join(" ")}${
      this.labels.length ? " " : ""
    }${this.fullName} {${
      this.property.length ? `\n${"\t".repeat(level)}` : ""
    }${this.property
      .map((p) => p.toPrettyString(macros))
      .join(`\n${"\t".repeat(level)}`)}${
      this.nodes.length
        ? `\n${"\t".repeat(level)}${this.nodes
            .map((n) => n.toFullString(macros, level + 1))
            .join(`\n${"\t".repeat(level)}`)}`
        : ""
    } 
${"\t".repeat(level - 1)}}; ${isOmmited ? " */" : ""}`;
  }

  serialize(macros: Map<string, MacroRegistryItem>): SerializedNode {
    const nodeAsts = [...this.definitions, ...this.referencedBy];
    const nodeType = this.nodeType;
    return {
      nodeType:
        nodeType instanceof NodeType
          ? {
              ...this.nodeType,
              properties: nodeType.properties.map((p) => ({
                name: typeof p.name === "string" ? p.name : "REGEX",
                allowedValues: p.allowedValues ?? [],
                type: p.type,
              })),
            }
          : undefined,
      issues: nodeAsts.flatMap((n) => n.serializeIssues),
      path: this.pathString,
      name: this.fullName,
      nodes: nodeAsts.map((d) => d.serialize(macros)),
      properties: this.property.map((p) => p.ast.serialize(macros)),
      childNodes: this.nodes.map((n) => n.serialize(macros)),
    };
  }
}
