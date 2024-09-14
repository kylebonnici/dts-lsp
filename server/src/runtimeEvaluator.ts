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
import { LabelAssign } from './ast/dtc/label';
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
		const names = new Set<string>();
		element.children.forEach((child) => {
			if (child instanceof DtcChildNode && child.name) {
				if (child.name && names.has(child.name.name)) {
					this._issues.push(this.genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
				}

				names.add(child.name.toString());
			} else if (child instanceof DeleteNode && child.nodeNameOrRef instanceof NodeName) {
				if (!runtimeNodeParent.hasNode(child.nodeNameOrRef.toString())) {
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
			const resolvedPath = element.path ? this.resolvePath(element.path) : undefined;
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
				? this.resolvePath([element.pathName])
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
			const resolvedPath = this.resolvePath([`&${element.nodeNameOrRef.value}`]);

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

	private resolvePath(path: string[]): string[] | undefined {
		if (!path?.[0].startsWith('&')) {
			return path;
		}

		const allLabels = this.runtime.rootNode.allDescendantsLabels;

		const childNodeParent = allLabels.find(
			(l) =>
				l.parentNode instanceof DtcChildNode &&
				l.parentNode.path &&
				this.runtime.rootNode
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
