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
			this.processChild(child);
		});
	}

	private processChild(element: ASTBase) {
		if (this.abort.signal.aborted) {
			return;
		}

		if (element instanceof DtcRootNode) {
			this.processNode(element, this.rootNode);
		} else if (element instanceof DtcChildNode) {
			const resolvedPath = element.path ? this.resolvePath(element.path) : undefined;

			let runTimeNode: Node | undefined;
			if (resolvedPath) {
				runTimeNode = this.rootNode.getChild(resolvedPath);
			}

			// top node in tree is a DtcRefNode which we cannot resolve
			if (!runTimeNode) {
				runTimeNode = new Node('');
			}

			this.processNode(element, runTimeNode);
		} else if (element instanceof DtcRefNode) {
			element.labels.forEach((label) => this.processLabel(label));

			const resolvedPath = element.pathName
				? this.resolvePath([element.pathName])
				: undefined;

			let runtimeNode: Node | undefined;
			if (!resolvedPath) {
				this.issues.push(
					this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element)
				);

				// create dummy runtime node
				runtimeNode = new Node('');
			} else {
				runtimeNode = this.rootNode.getChild(resolvedPath);
			}

			if (!runtimeNode) {
				throw new Error('Should have a runtime node by now');
			}

			this.processNode(element, runtimeNode);
		} else if (element instanceof DeleteNode) {
			if (element.nodeNameOrRef instanceof LabelRef && element.nodeNameOrRef.label) {
				const resolvedPath = this.resolvePath([element.nodeNameOrRef.label.value]);
				let runtimeNode: Node | undefined;

				if (resolvedPath) {
					runtimeNode = this.rootNode.getChild(resolvedPath);
				}

				if (!runtimeNode) {
					this.issues.push(
						this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element.nodeNameOrRef)
					);
				} else {
					runtimeNode.parent?.deleteNode(runtimeNode.name);
				}
			}
		}
	}

	public getContextIssue() {
		const ast = this.fileMap.map(astMap.get);
		if (ast.some((tree) => !tree)) {
			return [];
		}

		ast.forEach((tree) => {});
		// we have an Abstract tree for all files
	}

	private processNodeChildrenNodes(node: DtcBaseNode, runtimeNode: Node) {
		const name = new Set<string>();
		node.children.forEach((child) => {
			if (child instanceof DtcChildNode) {
				if (child.name && name.has(child.name.toString())) {
					this.issues.push(this.genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
				}
				child.labels.forEach((label) => this.processLabel(label));
				if (child.name?.name) {
					name.add(child.name.toString());
					runtimeNode.addNode(new Node(child.name.toString(), child, runtimeNode));
				}
			} else if (child instanceof DeleteNode) {
				if ((child.nodeNameOrRef instanceof NodeName, child.nodeNameOrRef?.value)) {
					if (!runtimeNode.hasNode(child.nodeNameOrRef.value)) {
						this.issues.push(
							this.genIssue(ContextIssues.NODE_DOES_NOT_EXIST, child.nodeNameOrRef)
						);
					} else {
						runtimeNode.deleteNode(child.nodeNameOrRef.value);
						name.delete(child.nodeNameOrRef.value);
					}
				}
			}
		});
	}

	private processLabel(labelAssign: LabelAssign) {
		if (!this.lablesUsed.has(labelAssign.label)) {
			this.lablesUsed.set(labelAssign.label, [labelAssign]);
			return;
		}

		const otherOwners = this.lablesUsed.get(labelAssign.label);

		let reportIssue = true;
		if (labelAssign.parent instanceof DtcRefNode) {
			// we need to check if the resolve to the same node or not if it does we can allow this

			const pathAssign = this.resolvePath([`&${labelAssign.label}`]);
			const pathExisting = this.resolvePath([labelAssign.parent.pathName]);
			if (pathAssign && pathExisting) {
				const existingOwner = this.rootNode.getChild(pathExisting)?.definiton;
				const assignOwner = this.rootNode.getChild(pathAssign)?.definiton;
				reportIssue = false;
				if (!(existingOwner && existingOwner === assignOwner)) {
					this.issues.push(
						this.genIssue(ContextIssues.RE_ASSIGN_NODE_LABEL, labelAssign.parent)
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
	}

	private processNode(node: DtcBaseNode, runtimeNode: Node) {
		if (node instanceof DtcRootNode) {
			this.processNodeChildrenNodes(node, runtimeNode);
			this.processNodeProperties(node, runtimeNode);

			node.nodes.forEach((child) => {
				this.processChild(child);
			});
		} else if (node instanceof DtcChildNode) {
			if (!node.name) {
				// process in isolation  TODO
			} else {
				this.processNodeChildrenNodes(node, runtimeNode);
				this.processNodeProperties(node, runtimeNode);

				node.nodes.forEach((child) => {
					this.processChild(child);
				});
			}
		}
	}

	private processNodeProperties(node: DtcBaseNode, runtimeNode: Node) {
		node.children.forEach((child) => {
			if (child instanceof DtcProperty) {
				child.allLabels.forEach((label) => {
					if (label) {
						this.processLabel(label);
					}
				});

				if (child.propertyName?.name && runtimeNode.hasProperty(child.propertyName.name)) {
					this.issues.push(
						this.genIssue(ContextIssues.DUPLICATE_PROPERTY_NAME, child.propertyName)
					);
				} else if (child.propertyName?.name) {
					runtimeNode.addProperty(new Property(child));
				}
			} else if (child instanceof DeleteProperty) {
				if (child.propertyName?.name && !runtimeNode.hasProperty(child.propertyName.name)) {
					this.issues.push(
						this.genIssue(ContextIssues.PROPERTY_DOES_NOT_EXIST, child.propertyName)
					);
				} else if (child.propertyName?.name) {
					runtimeNode.deleteProperty(child.propertyName.name);
				}
			}
		});
	}

	private resolvePath(path: string[]): string[] | undefined {
		if (!path?.[0].startsWith('&')) {
			return path;
		}

		const lablesOwners = this.lablesUsed.get(path?.[0].slice(1));

		const childNodeParent = lablesOwners
			?.map((label) => label.parent)
			?.find((element) => element instanceof DtcChildNode) as DtcChildNode | undefined;

		if (childNodeParent?.path) {
			return this.resolvePath([...childNodeParent.path, ...path.slice(1)]);
		}

		const refNodeParent = lablesOwners
			?.map((label) => label.parent)
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
