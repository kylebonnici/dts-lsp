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

export class ContextAware {
  _issues: Issue<ContextIssues>[] = [];
  private _runtime?: Runtime;
  public parser: Parser;

  constructor(uri: string, includePath: string[], common: string[]) {
    this.parser = new Parser(uri, includePath, common);
  }

  async getContextIssues() {
    return [...(await this.getRuntime()).issues, ...this._issues];
  }

  async getRuntime(): Promise<Runtime> {
    await this.parser.stable;
    return this._runtime ?? this.revaluate();
  }

  async getOrderedParsers(): Promise<Parser[]> {
    await this.parser.stable;
    return this.parser.orderedParsers;
  }

  async getParser(uri: string): Promise<Parser | undefined> {
    return (await this.getOrderedParsers()).find((p) => p.uri === uri);
  }

  async getDocumentLinks(file: string): Promise<DocumentLink[]> {
    const parser = await this.getParser(file);
    return (
      (parser?.cPreprocessorParser.includes
        .map((include) => {
          const path = parser.cPreprocessorParser.resolveInclude(include);
          if (path) {
            const link: DocumentLink = {
              range: toRange(include.path),
              target: `file://${path}`,
            };
            return link;
          }
        })
        .filter((r) => r) as DocumentLink[]) ?? []
    );
  }

  public async getOrderedContextFiles() {
    return (await this.getOrderedParsers()).map((f) => f.uri);
  }

  private linkPropertiesLablesAndNodePaths(runtime: Runtime) {
    const getAllProperties = (node: Node): Property[] => {
      return [...node.properties, ...node.nodes.flatMap(getAllProperties)];
    };
    const allProperties = getAllProperties(runtime.rootNode);

    allProperties.forEach((p) =>
      p.ast.allDescendants.forEach((c) => {
        if (c instanceof LabelRef) {
          const resolvesTo = runtime.resolvePath([`&${c.label?.value}`]);
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

  public async revaluate(uri?: string) {
    if (uri) {
      const parser = await this.getParser(uri);
      await parser?.reparse();
    }

    const files = await this.getOrderedContextFiles();
    const parsers = await this.getOrderedParsers();

    const runtime = new Runtime(files);
    this._issues = [];

    parsers.forEach((parser) => this.processRoot(parser.rootDocument, runtime));
    this.linkPropertiesLablesAndNodePaths(runtime);

    this._runtime = runtime;
    return runtime;
  }

  private processRoot(element: DtcBaseNode, runtime: Runtime) {
    element.children.forEach((child) => {
      this.processChild(child, runtime.rootNode, runtime);
    });
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
    runtime.rootNode.definitons.push(element);
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
        new Node(element.name.name, element.name.address, runtimeNodeParent);
      child.definitons.push(element);

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

    if (element.labelReferance) {
      const resolvedPath =
        element.resolveNodePath ??
        (element.pathName
          ? runtime.resolvePath([element.pathName])
          : undefined);
      if (!resolvedPath) {
        this._issues.push(
          genIssue(
            ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
            element.labelReferance,
            DiagnosticSeverity.Error,
            [],
            [],
            [element.labelReferance.label?.value ?? ""]
          )
        );
        runtime.unlinkedRefNodes.push(element);
      } else {
        element.resolveNodePath ??= [...resolvedPath];
        runtimeNode = runtime.rootNode.getChild(resolvedPath);
        element.labelReferance.linksTo = runtimeNode;
        runtimeNode?.linkedRefLabels.push(element.labelReferance);
        runtimeNode?.referancedBy.push(element);

        element.labels.forEach((label) => {
          runtime.lablesUsedCache.set(label.label, resolvedPath);
        });

        if (runtimeNode) {
          runtime.referances.push(element);
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
        this.processChild(child, runtimeNode ?? new Node(""), runtime)
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
            runtime.lablesUsedCache.delete(label.label);
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
          runtime.lablesUsedCache.delete(label.label);
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
        runtime.lablesUsedCache.delete(label.label);
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
