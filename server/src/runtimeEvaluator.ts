import { DiagnosticSeverity } from 'vscode-languageserver';
import { ASTBase } from './ast/base';
import { DtcBaseNode, DtcChildNode, DtcRefNode, DtcRootNode } from './ast/dtc/node';
import { DtcProperty } from './ast/dtc/property';
import { astMap } from './resultCache';
import { ContextIssues, Issue } from './types';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { LabelAssign } from './ast/dtc/label';

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
		private readonly parent: Node | null = null
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

	hasProperty(name: string) {
		return this._properties.some((property) => property.name === name);
	}

	deleteProperty(name: string) {
		const index = this._properties.findIndex((property) => property.name === name);
		if (index === -1) return;

		this._properties.splice(index, 1);
	}

	addProperty(property: Property) {
		this._properties.push(property);
	}

	getChild(path: string[]): Node | undefined {
		if (path.length === 0) return this;
		const myChild = this.nodes.find((node) => node.name === path[0]);
		return myChild?.getChild(path.slice(1));
	}
}
export class ContextAware {
	issues: Issue<ContextIssues>[] = [];
	private rootNode: Node = new Node('/');

	private lablesUsed = new Map<string, LabelAssign[]>();

	constructor(private fileMap: string[]) {
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
				if (!resolvedPath) {
					// dummy runtime node;
					runTimeNode = new Node('');
				} else if (resolvedPath) {
					// this is a now node lets add it
					const parentNodeRuntimeNodde = this.rootNode.getChild(resolvedPath.slice(0, -1));
					const nodeName = element.name?.toString();

					if (!nodeName) {
						throw new Error('Node should have a name');
					}

					runTimeNode = new Node(nodeName, element, runTimeNode);
					parentNodeRuntimeNodde?.nodes.push(runTimeNode);
				}
			}

			if (!runTimeNode) {
				throw new Error('Node should have runtime node by now');
			}

			this.processNode(element, runTimeNode);
		} else if (element instanceof DtcRefNode) {
			const resolvedPath = element.path ? this.resolvePath(element.path) : undefined;

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

	private processNodeChildrenNodes(nodeChildren: DtcChildNode[]) {
		const name = new Map<string, DtcBaseNode>();
		nodeChildren.forEach((child) => {
			if (child.name && name.has(child.name.toString())) {
				this.issues.push(this.genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
			}
			child.labels.forEach((label) => this.processLabel(label));
		});
	}

	private processLabel(labelAssign: LabelAssign) {
		if (!this.lablesUsed.has(labelAssign.label)) {
			this.lablesUsed.set(labelAssign.label, [labelAssign]);
			return;
		}

		const otherOwners = this.lablesUsed.get(labelAssign.label);

		let reportIssue = true;
		if (labelAssign.parent instanceof DtcChildNode) {
			// we need to check if the resolve to the same node or not if it does we can allow this

			const path = this.resolvePath([labelAssign.label]);
			if (path) {
				const existingOwner = this.rootNode.getChild(path)?.definiton;
				if (existingOwner && existingOwner === labelAssign.parent) {
					reportIssue = false;
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
			this.processNodeChildrenNodes(node.nodes);
			this.processNodeProperties(node, runtimeNode);

			node.children.forEach((child) => {
				this.processChild(child);
			});
		} else if (node instanceof DtcChildNode) {
			if (!node.name) {
				// process in isolation  TODO
			} else {
				this.processNodeChildrenNodes(node.nodes);
				this.processNodeProperties(node, runtimeNode);

				node.children.forEach((child) => {
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

		const lablesOwners = this.lablesUsed.get(path?.[0]);

		const childNodeParent = lablesOwners?.find(
			(element) => element instanceof DtcChildNode
		) as DtcChildNode | undefined;

		if (childNodeParent?.path) {
			return this.resolvePath([...childNodeParent.path, ...path.slice(1)]);
		}

		const refNodeParent = lablesOwners?.find((element) => element instanceof DtcRefNode) as
			| DtcRefNode
			| undefined;
		if (refNodeParent && refNodeParent.labelReferance?.label?.value) {
			return this.resolvePath([
				refNodeParent.labelReferance?.label?.value,
				...path.slice(1),
			]);
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
