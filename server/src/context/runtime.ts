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
  DtcBaseNode,
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
} from "../ast/dtc/node";
import {
  ContextIssues,
  Issue,
  Searchable,
  SearchableResult,
  StandardTypeIssue,
} from "../types";
import { Property } from "./property";
import { DeleteNode } from "../ast/dtc/deleteNode";
import {
  genIssue,
  getDeepestAstNodeInBetween,
  isLastTokenOnLine,
  positionInBetween,
  sortAstForScope,
} from "../helpers";
import { DiagnosticSeverity, Position } from "vscode-languageserver";
import { LabelAssign } from "../ast/dtc/label";
import { Node } from "./node";
import { getTokenizedDocumentProvider } from "../providers/tokenizedDocument";
import { BindingLoader } from "../dtsTypes/bindings/bindingLoader";
import { ASTBase } from "src/ast/base";
import { Include } from "src/ast/cPreprocessors/include";
import { Comment } from "src/ast/dtc/comment";
import { ContextAware } from "src/runtimeEvaluator";

export class Runtime implements Searchable {
  public comments: Comment[] = [];
  public includes: Include[] = [];
  public roots: DtcRootNode[] = [];
  public references: DtcRefNode[] = [];
  public unlinkedDeletes: DeleteNode[] = [];
  public unlinkedRefNodes: DtcRefNode[] = [];
  public globalDeletes: DeleteNode[] = [];
  public rootNode: Node = new Node(this.context.bindingLoader, "/");

  constructor(public context: ContextAware) {}

  public labelsUsedCache = new Map<string, string[]>();

  static getFileTopMostAst = (astNode: ASTBase, file: string): ASTBase[] => {
    return astNode.uri === file
      ? [astNode]
      : astNode.children.flatMap((c) => Runtime.getFileTopMostAst(c, file));
  };

  fileTopMostAst(file: string) {
    return [
      ...this.roots,
      ...this.references,
      ...this.unlinkedDeletes,
      ...this.unlinkedRefNodes,
      ...this.globalDeletes,
      ...this.includes,
      ...this.comments,
    ].flatMap((c) => Runtime.getFileTopMostAst(c, file));
  }

  getDeepestAstNode(
    file: string,
    position: Position
  ): SearchableResult | undefined {
    const fileAsts = this.fileTopMostAst(file);

    const dtcNode = fileAsts.find(
      (i) =>
        positionInBetween(i, file, position) ||
        isLastTokenOnLine(
          getTokenizedDocumentProvider().requestTokens(file, false),
          i,
          position
        )
    );

    if (dtcNode instanceof DtcRefNode) {
      const refByNode = this.rootNode.getReferenceBy(dtcNode);
      const result = refByNode?.getDeepestAstNode(file, position);
      if (result) {
        return { ...result, runtime: this };
      }
      return {
        item: null,
        runtime: this,
        ast: getDeepestAstNodeInBetween(dtcNode, file, position),
      };
    } else if (dtcNode instanceof DtcRootNode && dtcNode.path) {
      const result = this.rootNode.getDeepestAstNode(file, position);
      return result ? { ...result, runtime: this } : undefined;
    } else if (dtcNode instanceof DtcChildNode && dtcNode.path) {
      const result = Runtime.getNodeFromPath(
        dtcNode.path.slice(1),
        this.rootNode
      )?.getDeepestAstNode(file, position);
      return result ? { ...result, runtime: this } : undefined;
    } else if (dtcNode) {
      // unlinkedDeletes
      return {
        runtime: this,
        item: null,
        ast: getDeepestAstNodeInBetween(dtcNode, file, position),
      };
    }

    return;
  }

  static getNodeFromPath(
    path: string[],
    node: Node,
    strict = true
  ): Node | undefined {
    if (path.length === 0) return node;

    const nodeName = path[0].split("@");
    const name = nodeName[0];
    const addressStr = nodeName.at(1);
    const address = addressStr?.split(",").map((v) => Number.parseInt(v, 16));

    const remainingPath = path.slice(1);
    const childNode = node.getNode(name, address, strict);
    return childNode
      ? Runtime.getNodeFromPath(remainingPath, childNode, strict)
      : undefined;
  }

  resolvePath(path: string[], allLabels?: LabelAssign[]): string[] | undefined {
    if (!path.at(0)?.startsWith("&")) {
      return path;
    }

    const fromCache = this.labelsUsedCache.get(path[0].slice(1));
    if (fromCache) {
      return fromCache;
    }

    allLabels ??= this.rootNode.allDescendantsLabels;

    const label = allLabels.find(
      (l) =>
        l.label.value === path.at(0)?.slice(1) &&
        l.parentNode instanceof DtcBaseNode
    );

    return label?.lastLinkedTo?.path;
  }

  get issues(): Issue<ContextIssues>[] {
    return [...this.labelIssues(), ...this.rootNode.issues];
  }

  private labelIssues() {
    const issues: Issue<ContextIssues>[] = [];

    const lablesUsed = new Map<
      string,
      {
        label: LabelAssign;
        owner: Property | Node | null;
        skip?: boolean;
      }[]
    >();

    this.rootNode.allDescendantsLabelsMapped.forEach((item) => {
      if (!lablesUsed.has(item.label.label.value)) {
        lablesUsed.set(item.label.label.value, [item]);
      } else {
        lablesUsed.get(item.label.label.value)?.push(item);
      }
    });

    Array.from(lablesUsed).forEach((pair) => {
      const otherOwners = pair[1];
      if (otherOwners.length > 1) {
        const firstLabeledNode = otherOwners.find(
          (o) => o.owner instanceof Node
        );

        const allSameOwner = otherOwners.every(
          (owner) => owner && owner.owner === firstLabeledNode?.owner
        );

        if (!allSameOwner || !firstLabeledNode) {
          const conflits = otherOwners.filter(
            (owner) => !(owner && owner.owner === firstLabeledNode?.owner)
          );

          issues.push(
            genIssue(
              ContextIssues.LABEL_ALREADY_IN_USE,
              otherOwners.at(0)!.label,
              DiagnosticSeverity.Error,
              otherOwners.slice(1).map((o) => o.label),
              [],
              [otherOwners.at(0)!.label.label.value]
            )
          );
        }
      }
    });

    return issues;
  }

  get typesIssues() {
    const getIssue = (node: Node): Issue<StandardTypeIssue>[] => {
      return [
        ...(node.nodeType?.getIssue(this, node) ?? []),
        ...node.nodes.flatMap((n) => getIssue(n)),
      ];
    };

    return getIssue(this.rootNode);
  }

  getOrderedNodeAst(node: Node) {
    return sortAstForScope([...node.definitions, ...node.referencedBy]);
  }
}
