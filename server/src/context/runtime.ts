import { DtcChildNode, DtcRefNode, DtcRootNode, NodeName } from '../ast/dtc/node';
import { ContextIssues, Issue, Searchable, SearchableResult } from '../types';
import { Property } from './property';
import { DeleteProperty } from '../ast/dtc/deleteProperty';
import { DeleteNode } from '../ast/dtc/deleteNode';
import { getDeepestAstNodeInBetween, positionInBetween } from '../helpers';
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
import { LabelAssign } from '../ast/dtc/label';
import { ASTBase } from 'src/ast/base';
import { Node } from './node';

export class Runtime implements Searchable {
	public roots: DtcRootNode[] = [];
	public referances: DtcRefNode[] = [];
	public unlinkedDeletes: DeleteNode[] = [];
	public unlinkedRefNodes: DtcRefNode[] = [];
	public rootNode: Node = new Node('/');

	getDeepestAstNode(file: string, position: Position): SearchableResult | undefined {
		const dtcNode = [
			...this.roots,
			...this.referances,
			...this.unlinkedDeletes,
			...this.unlinkedRefNodes,
		].find((i) => positionInBetween(i, file, position));

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

	resolvePath(path: string[]): string[] | undefined {
		if (!path?.[0].startsWith('&')) {
			return path;
		}

		const allLabels = this.rootNode.allDescendantsLabels;

		const childNodeParent = allLabels.find(
			(l) =>
				l.parentNode instanceof DtcChildNode &&
				l.parentNode.path &&
				this.rootNode
					.getChild(l.parentNode.path)
					?.labels.some((ll) => ll.label === path?.[0].slice(1))
		)?.parentNode as DtcChildNode | undefined;

		if (childNodeParent?.path) {
			return this.resolvePath([...childNodeParent.path, ...path.slice(1)]);
		}

		const refNodeParent = allLabels.find(
			(l) =>
				l.parentNode instanceof DtcRefNode &&
				l.parentNode.labelReferance?.label?.value === path?.[0].slice(1)
		)?.parentNode as DtcRefNode | undefined;

		if (refNodeParent && refNodeParent.labelReferance?.label?.value) {
			return this.resolvePath([refNodeParent.pathName]);
		}

		return;
	}

	get issues(): Issue<ContextIssues>[] {
		return [
			...this.labelIssues(),
			...this.nodeRefIssues(),
			...this.nodePathRefIssues(),
			...this.rootNode.issues,
		];
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
				const firstLabeledNode = otherOwners.find((o) => o.owner instanceof Node);

				const allSameOwner = otherOwners.every(
					(owner) => owner && owner.owner === firstLabeledNode?.owner
				);

				if (!allSameOwner || !firstLabeledNode) {
					const conflits = otherOwners.filter(
						(owner) => !(owner && owner.owner === firstLabeledNode?.owner)
					);

					issues.push(
						this.genIssue(
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

	private nodeRefIssues() {
		const issues: Issue<ContextIssues>[] = [];

		const allRef = this.rootNode.nodeRefValues;

		allRef.forEach((ref) => {
			const resolved = this.resolvePath([`&${ref.label}`]);
			if (!resolved) {
				issues.push(this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, ref.ast));
			}
		});

		return issues;
	}

	private nodePathRefIssues() {
		const issues: Issue<ContextIssues>[] = [];

		const allPaths = this.rootNode.nodePathRefValues;

		allPaths.forEach((ref) => {
			const pathParts = ref.path?.path?.pathParts;
			if (pathParts && pathParts.every((p) => p?.value)) {
				const completeParts = pathParts as NodeName[];
				const okParts: string[] = [];
				const failed = pathParts.find((p, i) => {
					const child = this.rootNode.getChild([
						'/',
						...completeParts.slice(0, i + 1).map((p) => p.value),
					]);

					if (child) {
						okParts.push(p!.value);
					}

					return !child;
				});
				if (failed) {
					issues.push(
						this.genIssue(
							ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
							failed,
							DiagnosticSeverity.Error,
							[],
							[],
							[failed.value, okParts.join('/')]
						)
					);
				}
			}
		});

		return issues;
	}

	private genIssue = (
		issue: ContextIssues | ContextIssues[],
		slxBase: ASTBase,
		severity: DiagnosticSeverity = DiagnosticSeverity.Error,
		linkedTo: ASTBase[] = [],
		tags: DiagnosticTag[] | undefined = undefined,
		templateStrings: string[] = []
	): Issue<ContextIssues> => ({
		issues: Array.isArray(issue) ? issue : [issue],
		astElement: slxBase,
		severity,
		linkedTo,
		tags,
		templateStrings,
	});
}
