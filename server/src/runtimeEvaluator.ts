/* eslint-disable no-mixed-spaces-and-tabs */
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
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
import { DeleteNode } from './ast/dtc/deleteNode';
import { LabelRef } from './ast/dtc/labelRef';
import { Node } from './context/node';
import { Property } from './context/property';
import { Runtime } from './context/runtime';

export class ContextAware {
	_issues: Issue<ContextIssues>[] = [];
	public readonly runtime = new Runtime();

	constructor(public readonly fileMap: string[]) {
		this.process();
	}
	get issues() {
		return [...this.runtime.issues, ...this._issues];
	}

	private process() {
		const ast = this.fileMap.map((file) => ({
			uri: file,
			tree: astMap.get(file)?.parser.rootDocument,
		}));
		if (ast.some((tree) => !tree.tree)) {
			return;
		}

		ast.forEach((root) => {
			if (root.tree) {
				this.processRoot(root.tree);
			}
		});
	}

	private processRoot(element: DtcBaseNode) {
		element.children.forEach((child) => {
			this.processChild(child, this.runtime.rootNode);
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
		}
	}

	private checkNodeUniqueNames(element: DtcBaseNode, runtimeNodeParent: Node) {
		const names = new Set<string>(runtimeNodeParent.nodes.map((n) => n.name));
		element.children.forEach((child) => {
			if (child instanceof DtcChildNode && child.name) {
				if (child.name && names.has(child.name.name)) {
					this._issues.push(this.genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
				}

				names.add(child.name.toString());
			} else if (child instanceof DeleteNode && child.nodeNameOrRef instanceof NodeName) {
				if (!names.has(child.nodeNameOrRef.toString())) {
					this._issues.push(
						this.genIssue(ContextIssues.NODE_DOES_NOT_EXIST, child.nodeNameOrRef)
					);
				} else {
					names.delete(child.nodeNameOrRef.toString());
				}
			}
		});
	}

	private processDtcBaseNode(element: DtcBaseNode, runtimeNodeParent: Node) {
		if (element instanceof DtcRootNode) {
			this.processDtcRootNode(element);
		} else if (element instanceof DtcChildNode) {
			this.processDtcChildNode(element, runtimeNodeParent);
		} else if (element instanceof DtcRefNode) {
			this.processDtcRefNode(element);
		}
	}

	private processDtcRootNode(element: DtcRootNode) {
		this.runtime.roots.push(element);
		this.runtime.rootNode.definitons.push(element);
		this.checkNodeUniqueNames(element, this.runtime.rootNode);
		element.children.forEach((child) => this.processChild(child, this.runtime.rootNode));
	}

	private processDtcChildNode(element: DtcChildNode, runtimeNodeParent: Node) {
		if (element.name?.name) {
			const resolvedPath = element.path
				? this.runtime.resolvePath(element.path)
				: undefined;
			const runtimeNode = resolvedPath
				? this.runtime.rootNode.getChild(resolvedPath)
				: undefined;

			const child = runtimeNode ?? new Node(element.name.toString(), runtimeNodeParent);
			child.definitons.push(element);

			runtimeNodeParent = child;
			this.checkNodeUniqueNames(element, child);
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDtcRefNode(element: DtcRefNode) {
		let runtimeNode: Node | undefined;

		if (element.labelReferance) {
			const resolvedPath = element.pathName
				? this.runtime.resolvePath([element.pathName])
				: undefined;
			if (!resolvedPath) {
				this._issues.push(
					this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element)
				);
			} else {
				runtimeNode = this.runtime.rootNode.getChild(resolvedPath);
				runtimeNode?.referancesBy.push(element);
				this.runtime.referances.push(element);
				if (runtimeNode) {
					this.checkNodeUniqueNames(element, runtimeNode);
				}
			}
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNode ?? new Node(''))
		);
	}

	private processDtcProperty(element: DtcProperty, runtimeNodeParent: Node) {
		if (element.propertyName?.name) {
			runtimeNodeParent.addProperty(new Property(element));
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDeleteNode(element: DeleteNode, runtimeNodeParent: Node) {
		if (element.nodeNameOrRef instanceof NodeName && element.nodeNameOrRef?.value) {
			if (element.parentNode?.parentNode) {
				if (!runtimeNodeParent.hasNode(element.nodeNameOrRef.value)) {
					this._issues.push(
						this.genIssue(ContextIssues.NODE_DOES_NOT_EXIST, element.nodeNameOrRef)
					);
				} else {
					runtimeNodeParent.deleteNode(element.nodeNameOrRef.value, element);
				}
			}
		} else if (element.nodeNameOrRef instanceof LabelRef && element.nodeNameOrRef.value) {
			const resolvedPath = this.runtime.resolvePath([`&${element.nodeNameOrRef.value}`]);

			let runtimeNode: Node | undefined;
			if (!resolvedPath) {
				this.runtime.unlinkedDeletes.push(element);
				this._issues.push(
					this.genIssue(ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE, element)
				);
			} else {
				runtimeNode = this.runtime.rootNode.getChild(resolvedPath);
				runtimeNode?.parent?.deleteNode(runtimeNode.name, element);
			}
		} else {
			this.runtime.unlinkedDeletes.push(element);
		}
		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDeleteProperty(element: DeleteProperty, runtimeNodeParent: Node) {
		if (
			element.propertyName?.name &&
			!runtimeNodeParent.hasProperty(element.propertyName.name)
		) {
			this._issues.push(
				this.genIssue(ContextIssues.PROPERTY_DOES_NOT_EXIST, element.propertyName)
			);
		} else if (element.propertyName?.name) {
			runtimeNodeParent.deleteProperty(element.propertyName.name, element);
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
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
