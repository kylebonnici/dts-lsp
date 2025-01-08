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

import { ASTBase } from "./ast/base";
import {
  DtcBaseNode,
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "./ast/dtc/node";
import { DtcProperty } from "./ast/dtc/property";
import { ContextIssues, Issue } from "./types";
import { DeleteProperty } from "./ast/dtc/deleteProperty";
import { DeleteNode } from "./ast/dtc/deleteNode";
import { LabelRef } from "./ast/dtc/labelRef";
import { Node } from "./context/node";
import { Property } from "./context/property";
import { Runtime } from "./context/runtime";
import { genIssue, toRange } from "./helpers";
import { Parser } from "./parser";
import { DiagnosticSeverity, DocumentLink } from "vscode-languageserver";
import { NodePath, NodePathRef } from "./ast/dtc/values/nodePath";
import { Include } from "./ast/cPreprocessors/include";
import { BindingLoader } from "./dtsTypes/bindings/bindingLoader";
import { StringValue } from "./ast/dtc/values/string";
import { existsSync } from "fs";

let id = 0;
export class ContextAware {
  _issues: Issue<ContextIssues>[] = [];
  private _runtime?: Promise<Runtime>;
  public parser: Parser;
  private overlayParsers: Parser[];
  public readonly id = ++id;
  public overlays: string[] = [];

  constructor(
    uri: string,
    includePaths: string[],
    public readonly bindingLoader?: BindingLoader,
    overlays: string | string[] = []
  ) {
    this.overlays = Array.isArray(overlays) ? overlays : [overlays];
    this.overlays.filter(existsSync);

    this.parser = new Parser(uri, includePaths);
    this.overlayParsers =
      this.overlays?.map((overlay) => new Parser(overlay, includePaths)) ?? [];
  }

  async getContextIssues() {
    return [...(await this.getRuntime()).issues, ...this._issues];
  }

  async stable() {
    await Promise.all([
      this.parser.stable,
      ...this.overlayParsers.map((p) => p.stable),
    ]);
  }

  async getRuntime(): Promise<Runtime> {
    await this.stable();
    this._runtime ??= this.evaluate();
    return this._runtime;
  }

  async getOrderedParsers(): Promise<Parser[]> {
    await this.stable();
    return [...this.parser.orderedParsers, ...this.overlayParsers.reverse()];
  }

  async getParser(uri: string): Promise<Parser | undefined> {
    return (await this.getAllParsers())?.find((p) => p.uri === uri);
  }

  async getAllParsers(): Promise<Parser[]> {
    await this.stable();
    return [...this.parser.allParsers, ...this.overlayParsers];
  }

  async getDocumentLinks(file: string): Promise<DocumentLink[]> {
    const parser = await this.getParser(file);
    const runtime = await this.getRuntime();

    const bindingLinks =
      (runtime.rootNode.allBindingsProperties
        .filter((p) => p.ast.uri === file)
        .flatMap((p) =>
          p.ast.values?.values.flatMap((v) => {
            const node = p.parent;
            const nodeType = node?.nodeTypes.find(
              (t) =>
                v?.value instanceof StringValue &&
                t.compatible === v.value.value
            );
            return nodeType
              ? {
                  range: toRange(v!.value!),
                  target: `file://${nodeType.bindingsPath}`,
                }
              : undefined;
          })
        )
        .filter((v) => v) as DocumentLink[]) ?? [];

    return [
      ...((parser?.includes
        .map((include) => {
          const path = parser.resolveInclude(include);
          if (path) {
            const link: DocumentLink = {
              range: toRange(include.path),
              target: `file://${path}`,
            };
            return link;
          }
        })
        .filter((r) => r) as DocumentLink[]) ?? []),
      ...bindingLinks,
    ];
  }

  private linkPropertiesLabelsAndNodePaths(runtime: Runtime) {
    const getAllProperties = (node: Node): Property[] => {
      return [...node.properties, ...node.nodes.flatMap(getAllProperties)];
    };
    const allProperties = getAllProperties(runtime.rootNode);
    const allLabels = runtime.rootNode.allDescendantsLabels;

    allProperties.forEach((p) =>
      p.ast.allDescendants.forEach((c) => {
        if (c instanceof LabelRef) {
          const resolvesTo = runtime.resolvePath(
            [`&${c.label?.value}`],
            allLabels
          );
          if (resolvesTo) {
            const node = runtime.rootNode.getChild(resolvesTo);
            c.linksTo = node;
            node?.linkedRefLabels.push(c);
          } else if (c.value) {
            this._issues.push(
              genIssue(
                ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
                c,
                DiagnosticSeverity.Error,
                [],
                [],
                [c.value]
              )
            );
          }
        } else if (c instanceof NodePath) {
          let node: Node | undefined = runtime.rootNode;
          const paths = c.pathParts;
          for (let i = 0; i < paths.length && paths[i]; i++) {
            let issueFound = false;
            const nodePath = paths[i];

            if (nodePath) {
              const child: Node | undefined = node?.getNode(
                nodePath.name,
                nodePath.address,
                false
              );
              nodePath.linksTo = child;
              if (!issueFound && !child) {
                issueFound = true;

                this._issues.push(
                  genIssue(
                    ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
                    nodePath,
                    DiagnosticSeverity.Error,
                    [],
                    [],
                    [
                      nodePath.toString(),
                      `${c.pathParts
                        .filter((p) => p?.linksTo)
                        .map((p) => p?.toString())
                        .join("/")}`,
                    ]
                  )
                );
              }
              child?.linkedNodeNamePaths.push(nodePath);
              node = child;
            } else {
              break;
            }
          }
        }
      })
    );
  }

  public async reevaluate(uri: string) {
    const parser = await this.getParser(uri);
    await parser?.reparse();

    this._runtime = this.evaluate();
    return this._runtime;
  }

  public async evaluate() {
    const t = performance.now();
    await this.parser.stable;

    const runtime = new Runtime(this.bindingLoader);
    this._issues = [];

    await this.processRoot(this.parser.rootDocument, runtime);
    for (let i = 0; i < this.overlayParsers.length; i++) {
      await this.processRoot(this.overlayParsers[i].rootDocument, runtime);
    }

    this.linkPropertiesLabelsAndNodePaths(runtime);

    console.log("evaluate", performance.now() - t);
    return runtime;
  }

  private async processRoot(element: DtcBaseNode, runtime: Runtime) {
    for (let i = 0; i < element.children.length; i++) {
      const child = element.children[i];
      if (child instanceof Include) {
        const p = child.reolvedPath
          ? await this.getParser(child.reolvedPath)
          : undefined;
        if (p) {
          await this.processRoot(p.rootDocument, runtime);
        }
      } else {
        this.processChild(child, runtime.rootNode, runtime);
      }
    }
  }

  private processChild(
    element: ASTBase,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (element instanceof DtcBaseNode) {
      this.processDtcBaseNode(element, runtimeNodeParent, runtime);
    } else if (element instanceof DtcProperty) {
      this.processDtcProperty(element, runtimeNodeParent, runtime);
    } else if (element instanceof DeleteNode) {
      this.processDeleteNode(element, runtimeNodeParent, runtime);
    } else if (element instanceof DeleteProperty) {
      this.processDeleteProperty(element, runtimeNodeParent, runtime);
    }
  }

  private checkNodeUniqueNames(element: DtcBaseNode, runtimeNodeParent: Node) {
    const checkMatch = (
      values: (NodeName | { name: string; address?: number })[],
      nodeName: NodeName
    ) => {
      return values.some(
        (i) =>
          i.name === nodeName.name &&
          (i.address === undefined ||
            nodeName.address === undefined ||
            i.address === nodeName.address)
      );
    };
    const fullNames: { name: string; address?: number }[] =
      runtimeNodeParent.nodes.map((n) => ({
        name: n.name,
        address: n.address,
      }));

    let names: NodeName[] = [];

    element.children.forEach((child) => {
      if (child instanceof DtcChildNode && child.name) {
        if (checkMatch(names, child.name)) {
          this._issues.push(
            genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name)
          );
        }

        names.push(child.name);
      } else if (
        child instanceof DeleteNode &&
        child.nodeNameOrRef instanceof NodeName
      ) {
        const nodeName = child.nodeNameOrRef;
        if (checkMatch(fullNames, nodeName)) {
          names = names.filter((i) => checkMatch(names, i));
        }
      }
    });
  }

  private processDtcBaseNode(
    element: DtcBaseNode,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (element instanceof DtcRootNode) {
      this.processDtcRootNode(element, runtime);
    } else if (element instanceof DtcChildNode) {
      this.processDtcChildNode(element, runtimeNodeParent, runtime);
    } else if (element instanceof DtcRefNode) {
      this.processDtcRefNode(element, runtime);
    }
  }

  private processDtcRootNode(element: DtcRootNode, runtime: Runtime) {
    runtime.roots.push(element);
    runtime.rootNode.definitions.push(element);
    this.checkNodeUniqueNames(element, runtime.rootNode);
    [...element.children]
      .sort((a, b) => {
        if (
          (a instanceof DtcProperty && b instanceof DeleteProperty) ||
          (b instanceof DtcProperty && a instanceof DeleteProperty)
        )
          return 0;

        if (b instanceof DtcProperty) return 1;
        return 0;
      })
      .forEach((child) => this.processChild(child, runtime.rootNode, runtime));
  }

  private processDtcChildNode(
    element: DtcChildNode,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (element.name?.name) {
      const resolvedPath = element.path
        ? runtime.resolvePath(element.path)
        : undefined;
      const runtimeNode = resolvedPath
        ? runtime.rootNode.getChild(resolvedPath)
        : undefined;

      const child =
        runtimeNode ??
        new Node(
          this.bindingLoader,
          element.name.name,
          element.name.address,
          runtimeNodeParent
        );
      child.definitions.push(element);
      element.labels.forEach((l) => (l.lastLinkedTo = child));

      runtimeNodeParent = child;
      this.checkNodeUniqueNames(element, child);
    }

    [...element.children]
      .sort((a, b) => {
        if (a instanceof DtcBaseNode && b instanceof DtcBaseNode) return 0;
        if (a instanceof DtcBaseNode) return -1;
        return 0;
      })
      .forEach((child) => this.processChild(child, runtimeNodeParent, runtime));
  }

  private processDtcRefNode(element: DtcRefNode, runtime: Runtime) {
    let runtimeNode: Node | undefined;

    if (element.labelReference) {
      const resolvedPath =
        element.resolveNodePath ??
        (element.pathName
          ? runtime.resolvePath([element.pathName])
          : undefined);
      if (!resolvedPath) {
        this._issues.push(
          genIssue(
            ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
            element.labelReference,
            DiagnosticSeverity.Error,
            [],
            [],
            [element.labelReference.label?.value ?? ""]
          )
        );
        runtime.unlinkedRefNodes.push(element);
      } else {
        element.resolveNodePath ??= [...resolvedPath];
        runtimeNode = runtime.rootNode.getChild(resolvedPath);
        element.labelReference.linksTo = runtimeNode;
        element.labels.forEach((l) => (l.lastLinkedTo = runtimeNode));
        runtimeNode?.linkedRefLabels.push(element.labelReference);
        runtimeNode?.referencedBy.push(element);

        element.labels.forEach((label) => {
          runtime.labelsUsedCache.set(label.label.value, resolvedPath);
        });

        if (runtimeNode) {
          runtime.references.push(element);
          this.checkNodeUniqueNames(element, runtimeNode);
        } else {
          runtime.unlinkedRefNodes.push(element);
        }
      }
    } else {
      runtime.unlinkedRefNodes.push(element);
    }

    [...element.children]
      .sort((a, b) => {
        if (a instanceof DtcBaseNode && b instanceof DtcBaseNode) return 0;
        if (a instanceof DtcBaseNode) return -1;
        return 0;
      })
      .forEach((child) =>
        this.processChild(
          child,
          runtimeNode ?? new Node(this.bindingLoader, ""),
          runtime
        )
      );
  }

  private processDtcProperty(
    element: DtcProperty,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (element.propertyName?.name) {
      runtimeNodeParent.addProperty(new Property(element, runtimeNodeParent));
    }

    element.children.forEach((child) =>
      this.processChild(child, runtimeNodeParent, runtime)
    );
  }

  private processDeleteNode(
    element: DeleteNode,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (
      element.nodeNameOrRef instanceof NodeName &&
      element.nodeNameOrRef.value
    ) {
      if (element.parentNode?.parentNode) {
        if (
          !runtimeNodeParent.hasNode(
            element.nodeNameOrRef.name,
            element.nodeNameOrRef.address
          )
        ) {
          this._issues.push(
            genIssue(ContextIssues.NODE_DOES_NOT_EXIST, element.nodeNameOrRef)
          );
        } else {
          runtimeNodeParent.deletes.push(element);
          const nodeToBeDeleted = runtimeNodeParent.getNode(
            element.nodeNameOrRef.name,
            element.nodeNameOrRef.address
          );
          element.nodeNameOrRef.linksTo = nodeToBeDeleted;
          runtimeNodeParent.deleteNode(
            element.nodeNameOrRef.name,
            element,
            element.nodeNameOrRef.address
          );

          nodeToBeDeleted?.labels.forEach((label) => {
            runtime.labelsUsedCache.delete(label.label.value);
          });
        }
      }
    } else if (
      element.nodeNameOrRef instanceof LabelRef &&
      element.nodeNameOrRef.value
    ) {
      const resolvedPath = runtime.resolvePath([
        `&${element.nodeNameOrRef.value}`,
      ]);

      let runtimeNode: Node | undefined;
      if (!resolvedPath) {
        runtime.unlinkedDeletes.push(element);
        this._issues.push(
          genIssue(
            ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
            element.nodeNameOrRef,
            DiagnosticSeverity.Error,
            [],
            [],
            [element.nodeNameOrRef.value]
          )
        );
      } else {
        runtimeNode = runtime.rootNode.getChild(resolvedPath);
        runtimeNodeParent.deletes.push(element);
        element.nodeNameOrRef.linksTo = runtimeNode;

        runtimeNode?.labels.forEach((label) => {
          runtime.labelsUsedCache.delete(label.label.value);
        });

        runtimeNode?.linkedRefLabels.push(element.nodeNameOrRef);
        runtimeNode?.parent?.deleteNode(
          runtimeNode.name,
          element,
          runtimeNode.address
        );

        if (
          element.parentNode instanceof DtcBaseNode &&
          !element.parentNode.pathName
        ) {
          runtime.globalDeletes.push(element);
        }
      }
    } else if (
      element.nodeNameOrRef instanceof NodePathRef &&
      element.nodeNameOrRef.path &&
      !element.nodeNameOrRef.path.pathParts.some((p) => !p)
    ) {
      const resolvedPath = [
        "/",
        ...(element.nodeNameOrRef.path.pathParts as NodeName[]).map((n) =>
          n.toString()
        ),
      ];

      let node: Node | undefined = runtime.rootNode;
      const paths = element.nodeNameOrRef.path.pathParts;
      for (let i = 0; i < paths.length && paths[i]; i++) {
        const nodePath = paths[i];

        if (nodePath) {
          const child: Node | undefined = node?.getNode(
            nodePath.name,
            nodePath.address,
            false
          );
          nodePath.linksTo = child;
          child?.linkedNodeNamePaths.push(nodePath);
          node = child;
        }
      }

      const allPathDefined = element.nodeNameOrRef.path.pathParts.every(
        (p) => p
      );
      const unresolvedNodeName = element.nodeNameOrRef.path.pathParts.find(
        (p) => p && !p.linksTo
      );

      const runtimeNode = element.nodeNameOrRef.path.pathParts.at(-1)?.linksTo;

      if (!runtimeNode) {
        runtime.unlinkedDeletes.push(element);
        if (unresolvedNodeName) {
          this._issues.push(
            genIssue(
              ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
              unresolvedNodeName,
              DiagnosticSeverity.Error,
              [],
              [],
              [
                unresolvedNodeName.toString(),
                `${element.nodeNameOrRef.path.pathParts
                  .filter((p) => p?.linksTo)
                  .map((p) => p?.toString())
                  .join("/")}`,
              ]
            )
          );
        }
      }
      runtimeNodeParent.deletes.push(element);

      runtimeNode?.labels.forEach((label) => {
        runtime.labelsUsedCache.delete(label.label.value);
      });

      runtimeNode?.parent?.deleteNode(
        runtimeNode.name,
        element,
        runtimeNode.address
      );

      if (
        element.parentNode instanceof DtcBaseNode &&
        !element.parentNode.pathName
      ) {
        runtime.globalDeletes.push(element);
      }
    } else {
      runtime.unlinkedDeletes.push(element);
    }
    element.children.forEach((child) =>
      this.processChild(child, runtimeNodeParent, runtime)
    );
  }

  private processDeleteProperty(
    element: DeleteProperty,
    runtimeNodeParent: Node,
    runtime: Runtime
  ) {
    if (
      element.propertyName?.name &&
      !runtimeNodeParent.hasProperty(element.propertyName.name)
    ) {
      this._issues.push(
        genIssue(ContextIssues.PROPERTY_DOES_NOT_EXIST, element.propertyName)
      );
    } else if (element.propertyName?.name) {
      runtimeNodeParent.deletes.push(element);
      runtimeNodeParent.deleteProperty(element.propertyName.name, element);
    }

    element.children.forEach((child) =>
      this.processChild(child, runtimeNodeParent, runtime)
    );
  }
}
