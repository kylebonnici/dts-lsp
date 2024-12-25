import { DtcBaseNode, DtcRefNode, DtcRootNode } from "../ast/dtc/node";
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

export class Runtime implements Searchable {
  public roots: DtcRootNode[] = [];
  public references: DtcRefNode[] = [];
  public unlinkedDeletes: DeleteNode[] = [];
  public unlinkedRefNodes: DtcRefNode[] = [];
  public globalDeletes: DeleteNode[] = [];
  public rootNode: Node = new Node("/");

  constructor(private readonly orderedFiles: string[]) {}

  public labelsUsedCache = new Map<string, string[]>();

  getDeepestAstNode(
    previousFiles: string[],
    file: string,
    position: Position
  ): SearchableResult | undefined {
    const dtcNode = [
      ...this.roots,
      ...this.references,
      ...this.unlinkedDeletes,
      ...this.unlinkedRefNodes,
      ...this.globalDeletes,
    ].find(
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
      const result = refByNode?.getDeepestAstNode(
        previousFiles,
        file,
        position
      );
      if (result) {
        return { ...result, runtime: this };
      }
      return {
        item: null,
        runtime: this,
        ast: getDeepestAstNodeInBetween(dtcNode, previousFiles, file, position),
      };
    } else if (dtcNode instanceof DtcRootNode && dtcNode.path) {
      const result = this.rootNode.getDeepestAstNode(
        previousFiles,
        file,
        position
      );
      return result ? { ...result, runtime: this } : undefined;
    } else if (dtcNode) {
      // unlinkedDeletes
      return {
        runtime: this,
        item: null,
        ast: getDeepestAstNodeInBetween(dtcNode, previousFiles, file, position),
      };
    }

    return;
  }

  resolvePath(path: string[]): string[] | undefined {
    if (!path?.[0].startsWith("&")) {
      return path;
    }

    const fromCache = this.labelsUsedCache.get(path[0].slice(1));
    if (fromCache) {
      return fromCache;
    }

    const allLabels = this.rootNode.allDescendantsLabels;

    const label = allLabels.find(
      (l) =>
        l.label === path?.[0].slice(1) && l.parentNode instanceof DtcBaseNode
    )?.parentNode as DtcBaseNode | undefined;

    const newPath = label?.path;

    if (newPath) {
      return this.resolvePath(newPath);
    }

    return;
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
      if (!lablesUsed.has(item.label.label)) {
        lablesUsed.set(item.label.label, [item]);
      } else {
        lablesUsed.get(item.label.label)?.push(item);
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
              [otherOwners.at(0)!.label.label]
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
        ...node.nodeType.getIssue(this),
        ...node.nodes.flatMap((n) => getIssue(n)),
      ];
    };

    return getIssue(this.rootNode);
  }

  getOrderedNodeAst(node: Node) {
    return sortAstForScope(
      [...node.definitions, ...node.referencedBy],
      this.orderedFiles
    );
  }
}
