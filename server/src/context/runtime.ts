import {
	DtcBaseNode,
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
	NodeName,
} from '../ast/dtc/node';
import {
	ContextIssues,
	Issue,
	Searchable,
	SearchableResult,
	StandardTypeIssue,
} from '../types';
import { Property } from './property';
import { DeleteNode } from '../ast/dtc/deleteNode';
import {
	genIssue,
	getDeepestAstNodeInBetween,
	isLastTokenOnLine,
	positionInBetween,
	sortAstForScope,
} from '../helpers';
import { DiagnosticSeverity, Position } from 'vscode-languageserver';
import { LabelAssign } from '../ast/dtc/label';
import { Node } from './node';
import { astMap } from '../resultCache';
import { getTokenizedDocmentProvider } from '../providers/tokenizedDocument';

export class Runtime implements Searchable {
	public roots: DtcRootNode[] = [];
	public referances: DtcRefNode[] = [];
	public unlinkedDeletes: DeleteNode[] = [];
	public unlinkedRefNodes: DtcRefNode[] = [];
	public rootNode: Node = new Node('/');

	constructor(private readonly fileOrder: string[]) {}

	getDeepestAstNode(
		previousFiles: string[],
		file: string,
		position: Position
	): SearchableResult | undefined {
		const dtcNode = [
			...this.roots,
			...this.referances,
			...this.unlinkedDeletes,
			...this.unlinkedRefNodes,
		].find(
			(i) =>
				positionInBetween(i, file, position) ||
				isLastTokenOnLine(
					getTokenizedDocmentProvider().requestTokens(file, false),
					i,
					position
				)
		);

		if (dtcNode instanceof DtcRefNode) {
			const refByNode = this.rootNode.getReferenceBy(dtcNode);
			const result = refByNode?.getDeepestAstNode(previousFiles, file, position);
			if (result) {
				return { ...result, runtime: this };
			}
			return {
				item: null,
				runtime: this,
				ast: getDeepestAstNodeInBetween(dtcNode, previousFiles, file, position),
			};
		} else if (dtcNode instanceof DtcRootNode && dtcNode.path) {
			const result = this.rootNode.getDeepestAstNode(previousFiles, file, position);
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
		if (!path?.[0].startsWith('&')) {
			return path;
		}

		const allLabels = this.rootNode.allDescendantsLabels;

		const label = allLabels.find(
			(l) => l.label === path?.[0].slice(1) && l.parentNode instanceof DtcBaseNode
		)?.parentNode as DtcBaseNode | undefined;

		const newPath = label?.path;

		if (newPath) {
			return this.resolvePath(newPath);
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

	private nodeRefIssues() {
		const issues: Issue<ContextIssues>[] = [];

		const allRef = this.rootNode.nodeRefValues;

		allRef.forEach((ref) => {
			const resolved = this.resolvePath([`&${ref.label}`]);
			if (!resolved) {
				issues.push(
					genIssue(
						ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
						ref.ast,
						DiagnosticSeverity.Error,
						[],
						[],
						[ref.label]
					)
				);
			}
		});

		return issues;
	}

	get typesIssues() {
		const getIssue = (node: Node): Issue<StandardTypeIssue>[] => {
			return [...node.nodeType.getIssue(this), ...node.nodes.flatMap((n) => getIssue(n))];
		};

		return getIssue(this.rootNode);
	}

	private nodePathRefIssues() {
		const issues: Issue<ContextIssues>[] = [];

		const allPaths = this.rootNode.nodePathRefValues;

		allPaths.forEach((ref) => {
			const pathParts = ref.path?.pathParts;
			if (pathParts && pathParts.every((p) => p?.value)) {
				const completeParts = pathParts as NodeName[];
				const okParts: string[] = [];
				const failed = pathParts.find((p, i) => {
					const child = this.rootNode.getChild([
						'/',
						...completeParts.slice(0, i + 1).map((p) => p.toString()),
					]);

					if (child) {
						okParts.push(p!.value);
					}

					return !child;
				});
				if (failed) {
					issues.push(
						genIssue(
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

	getOrderedNodeAst(node: Node) {
		return sortAstForScope([...node.definitons, ...node.referancedBy], this.fileOrder);
	}
}
