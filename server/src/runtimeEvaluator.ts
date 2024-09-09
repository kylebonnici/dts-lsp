import { DiagnosticSeverity, Position } from 'vscode-languageserver';
import { ASTBase } from './ast/base';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
	NodeName,
} from './ast/dtc/node';
import { DtcProperty } from './ast/dtc/property';
import { astMap } from './resultCache';
import { ContextIssues, Issue } from './types';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { LabelAssign } from './ast/dtc/label';
import { DeleteNode } from './ast/dtc/deleteNode';
import { LabelRef } from './ast/dtc/labelRef';

class Property {
	constructor(private ast: DtcProperty) {}

	get name() {
		return this.ast.propertyName?.name ?? '[UNSET]';
	}
}
class Node {
	private _properties: Property[] = [];
	nodes: Node[] = [];

	constructor(
		public readonly name: string,
		public readonly definiton?: DtcChildNode,
		public readonly parent: Node | null = null
	) {}

	get path(): string[] {
		return this.parent ? [...this.parent.path, this.name] : [this.name];
	}

	get properties() {
		return this._properties;
	}

	get propertyNames() {
		return this._properties.map((property) => property.name);
	}

	hasNode(name: string) {
		return this.nodes.some((node) => node.name === name);
	}

	hasProperty(name: string) {
		return this._properties.some((property) => property.name === name);
	}

	deleteNode(name: string) {
		const index = this.nodes.findIndex((node) => node.name === name);
		if (index === -1) return;

		this.nodes.splice(index, 1);
	}

	getNode(name: string) {
		const index = this.nodes.findIndex((node) => node.name === name);
		if (index === -1) return;

		return this.nodes[index];
	}

	deleteProperty(name: string) {
		const index = this._properties.findIndex((property) => property.name === name);
		if (index === -1) return;

		this._properties.splice(index, 1);
	}

	addNode(node: Node) {
		this.nodes.push(node);
	}

	addProperty(property: Property) {
		this._properties.push(property);
	}

	getChild(path: string[]): Node | undefined {
		if (path.length === 0) return this;
		if (path[0] !== this.name) return undefined;
		path.splice(0, 1);
		const myChild = this.nodes.find((node) => node.name === path[0]);
		return myChild?.getChild(path.slice(1));
	}
}
export class ContextAware {
	issues: Issue<ContextIssues>[] = [];
	private rootNode: Node = new Node('/');

	private lablesUsed = new Map<string, LabelAssign[]>();

	constructor(
		private fileMap: string[],
		private readonly abort: AbortController,
		private readonly stop?: {
			uri: string;
			position: Position;
		}
	) {
		this.process();
	}

	private process() {
		const ast = this.fileMap.map((file) => astMap.get(file)?.parser.rootDocument);
		if (ast.some((tree) => !tree)) {
			return;
		}

		const trees = ast as DtcBaseNode[];

		trees.forEach((root) => {
			this.processRoot(root);
		});
	}

	private processRoot(element: DtcBaseNode) {
		element.children.forEach((child) => {
			this.processChild(child, this.rootNode);
		});
	}

	private processChild(element: ASTBase, runtimeNodeParent: Node) {
		if (element instanceof DtcBaseNode) {
			this.processDtcBaseNode(element, runtimeNodeParent);
		} else if (element instanceof DtcProperty) {
			this.processDtcProperty(element, runtimeNodeParent);
		} else if (element instanceof DeleteNode) {
			this.processDeleteNode(element, runtimeNodeParent);
		} else if (element instanceof DeleteProperty) {
			this.processDeleteProperty(element, runtimeNodeParent);
		} else if (element instanceof LabelAssign) {
			this.processLabelAssign(element, runtimeNodeParent);
		}
	}

	private checkNodeUniqueNames(element: DtcBaseNode) {
		const names = new Set<string>();
		element.children.forEach((child) => {
			if (child instanceof DtcChildNode && child.name) {
				if (child.name && names.has(child.name.name)) {
					this.issues.push(this.genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
				}

				names.add(child.name.toString());
			} else if (child instanceof DeleteNode && child.nodeNameOrRef instanceof NodeName) {
				if (!names.has(child.nodeNameOrRef.toString())) {
					this.issues.push(
						this.genIssue(ContextIssues.NODE_DOES_NOT_EXIST, child.nodeNameOrRef)
					);
				} else {
					names.delete(child.nodeNameOrRef.toString());
		}
			}
		});
	}

	private processDtcBaseNode(element: DtcBaseNode, runtimeNodeParent: Node) {
		this.checkNodeUniqueNames(element);

		if (element instanceof DtcRootNode) {
			this.processDtcRootNode(element);
		} else if (element instanceof DtcChildNode) {
			this.processDtcChildNode(element, runtimeNodeParent);
		} else if (element instanceof DtcRefNode) {
			this.processDtcRefNode(element);
		}
	}

	private processDtcRootNode(element: DtcRootNode) {
		element.children.forEach((child) => this.processChild(child, this.rootNode));
	}

	private processDtcChildNode(element: DtcChildNode, runtimeNodeParent: Node) {
		if (element.name?.name) {
			const child = new Node(element.name.toString(), element, runtimeNodeParent);
			runtimeNodeParent.addNode(child);
			runtimeNodeParent = child;
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDtcRefNode(element: DtcRefNode) {
		let runtimeNode: Node | undefined;

		if (element.labelReferance) {
			const resolvedPath = element.pathName
				? this.resolvePath([element.pathName])
				: undefined;
			if (!resolvedPath) {
				this.issues.push(
					this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element)
				);
			} else {
				runtimeNode = this.rootNode.getChild(resolvedPath);
			}
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNode ?? new Node(''))
		);
			}

	private processDtcProperty(element: DtcProperty, runtimeNodeParent: Node) {
		if (
			element.propertyName?.name &&
			runtimeNodeParent.hasProperty(element.propertyName.name)
		) {
					this.issues.push(
				this.genIssue(ContextIssues.DUPLICATE_PROPERTY_NAME, element.propertyName)
					);
		} else if (element.propertyName?.name) {
			runtimeNodeParent.addProperty(new Property(element));
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private reverseLabelNodeRefLookUp(refName: string): LabelAssign[] {
		const result = Array.from(this.lablesUsed)
			.filter((v) => {
				return v[1].filter(
					(n) =>
						n.parentNode instanceof DtcRefNode &&
						n.parentNode.labelReferance?.value === refName
				);
			})
			.flatMap((n) => n[1]);

		return [...result, ...result.flatMap((l) => this.reverseLabelNodeRefLookUp(l.label))];
	}

	private processDeleteNode(element: DeleteNode, runtimeNodeParent: Node) {
		if (element.nodeNameOrRef instanceof NodeName && element.nodeNameOrRef?.value) {
			if (!runtimeNodeParent.hasNode(element.nodeNameOrRef.value)) {
				this.issues.push(
					this.genIssue(ContextIssues.NODE_DOES_NOT_EXIST, element.nodeNameOrRef)
				);
			} else {
				runtimeNodeParent.getNode(element.nodeNameOrRef.value)?.definiton?.labels;
				runtimeNodeParent.deleteNode(element.nodeNameOrRef.value);
			}
		} else if (element.nodeNameOrRef instanceof LabelRef && element.nodeNameOrRef.value) {
			const resolvedPath = this.resolvePath([`&${element.nodeNameOrRef.value}`]);

			let runtimeNode: Node | undefined;
			if (!resolvedPath) {
						this.issues.push(
					this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element)
						);
					} else {
				runtimeNode = this.rootNode.getChild(resolvedPath);
				runtimeNode?.parent?.deleteNode(runtimeNode.name);
			}
		}
		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDeleteProperty(element: DeleteProperty, runtimeNodeParent: Node) {
		if (
			element.propertyName?.name &&
			!runtimeNodeParent.hasProperty(element.propertyName.name)
		) {
			this.issues.push(
				this.genIssue(ContextIssues.PROPERTY_DOES_NOT_EXIST, element.propertyName)
			);
		} else if (element.propertyName?.name) {
			runtimeNodeParent.deleteProperty(element.propertyName.name);
					}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processLabelAssign(labelAssign: LabelAssign, runtimeNodeParent: Node) {
		if (!this.lablesUsed.has(labelAssign.label)) {
			this.lablesUsed.set(labelAssign.label, [labelAssign]);
			return;
		}

		const otherOwners = this.lablesUsed.get(labelAssign.label);

		let reportIssue = true;
		if (labelAssign.parentNode instanceof DtcRefNode) {
			// we need to check if the resolve to the same node or not if it does we can allow this

			const pathAssign = this.resolvePath([`&${labelAssign.label}`]);
			const pathExisting = this.resolvePath([labelAssign.parentNode.pathName]);
			if (pathAssign && pathExisting) {
				const existingOwner = this.rootNode.getChild(pathExisting)?.definiton;
				const assignOwner = this.rootNode.getChild(pathAssign)?.definiton;
				reportIssue = false;
				if (!(existingOwner && existingOwner === assignOwner)) {
					this.issues.push(
						this.genIssue(ContextIssues.RE_ASSIGN_NODE_LABEL, labelAssign.parentNode)
					);
				}
			}
		}

		if (reportIssue) {
			if (otherOwners?.length === 1) {
				this.issues.push(this.genIssue(ContextIssues.LABEL_ALREADY_IN_USE, otherOwners[0]));
			}
			this.issues.push(this.genIssue(ContextIssues.LABEL_ALREADY_IN_USE, labelAssign));
		}

		otherOwners?.push(labelAssign);

		labelAssign.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private resolvePath(path: string[]): string[] | undefined {
		if (!path?.[0].startsWith('&')) {
			return path;
		}

		const lablesOwners = this.lablesUsed.get(path?.[0].slice(1));

		const childNodeParent = lablesOwners
			?.map((label) => label.parentNode)
			?.find((element) => element instanceof DtcChildNode) as DtcChildNode | undefined;

		if (childNodeParent?.path) {
			return this.resolvePath([...childNodeParent.path, ...path.slice(1)]);
		}

		const refNodeParent = lablesOwners
			?.map((label) => label.parentNode)
			?.find((element) => element instanceof DtcRefNode) as DtcRefNode | undefined;
		if (refNodeParent && refNodeParent.labelReferance?.label?.value) {
			return this.resolvePath([refNodeParent.pathName]);
		}

		return;
	}

	private genIssue = (
		issue: ContextIssues | ContextIssues[],
		slxBase: ASTBase,
		severity: DiagnosticSeverity = DiagnosticSeverity.Error
	): Issue<ContextIssues> => ({
		issues: Array.isArray(issue) ? issue : [issue],
		slxElement: slxBase,
		severity,
	});
}
