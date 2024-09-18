/* eslint-disable no-mixed-spaces-and-tabs */
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
import { genIssue } from './helpers';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { readFileSync } from 'fs-extra';
import { DiagnosticSeverity } from 'vscode-languageserver';

export class ContextAware {
	_issues: Issue<ContextIssues>[] = [];
	public runtime: Runtime;

	constructor(
		private readonly includePaths: string[],
		private readonly commonPaths: string[],
		public readonly fileMap: string[]
	) {
		this.runtime = new Runtime(this.contextFiles());
	}

	get issues() {
		return [...this.runtime.issues, ...this._issues];
	}

	private prepareContext(file: string): string[] {
		let parser = astMap.get(file)?.parser;

		if (!parser) {
			const lexer = new Lexer(readFileSync(file).toString());
			parser = new Parser(lexer.tokens, file);
			astMap.set(file, { lexer, parser });
		}

		return [
			...parser
				.includePaths(this.includePaths, this.commonPaths)
				.flatMap((p) => this.prepareContext(p)),
			file,
		];
	}

	public contextFiles() {
		return this.fileMap.flatMap((f) => this.prepareContext(f));
	}

	public revaluate() {
		const files = this.contextFiles();

		this.runtime = new Runtime(files);
		this._issues = [];

		const ast = files.map((file) => {
			return {
				uri: file,
				tree: astMap.get(file)?.parser.rootDocument,
			};
		});

		if (ast.some((tree) => !tree.tree)) {
			return;
		}

		ast.forEach((root) => {
			if (root.tree) {
				console.time(`revaluate - ${root.uri}`);
				this.processRoot(root.tree);
				console.timeEnd(`revaluate - ${root.uri}`);
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
		const fullNames = new Set<string>(runtimeNodeParent.nodes.map((n) => n.name));
		const names = new Set<string>();
		element.children.forEach((child) => {
			if (child instanceof DtcChildNode && child.name) {
				if (child.name && names.has(child.name.name)) {
					this._issues.push(genIssue(ContextIssues.DUPLICATE_NODE_NAME, child.name));
				}

				names.add(child.name.toString());
			} else if (child instanceof DeleteNode && child.nodeNameOrRef instanceof NodeName) {
				if (fullNames.has(child.nodeNameOrRef.toString())) {
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
			const resolvedPath =
				element.resolveNodePath ??
				(element.pathName ? this.runtime.resolvePath([element.pathName]) : undefined);
			if (!resolvedPath) {
				this._issues.push(
					genIssue(
						ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
						element.labelReferance,
						DiagnosticSeverity.Error,
						[],
						[],
						[element.labelReferance.label?.value ?? '']
					)
				);
				this.runtime.unlinkedRefNodes.push(element);
			} else {
				element.resolveNodePath ??= [...resolvedPath];
				runtimeNode = this.runtime.rootNode.getChild(resolvedPath);
				runtimeNode?.referancesBy.push(element);
				if (runtimeNode) {
					this.runtime.referances.push(element);
					this.checkNodeUniqueNames(element, runtimeNode);
				} else {
					this.runtime.unlinkedRefNodes.push(element);
				}
			}
		} else {
			this.runtime.unlinkedRefNodes.push(element);
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNode ?? new Node(''))
		);
	}

	private processDtcProperty(element: DtcProperty, runtimeNodeParent: Node) {
		if (element.propertyName?.name) {
			runtimeNodeParent.addProperty(new Property(element, runtimeNodeParent));
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}

	private processDeleteNode(element: DeleteNode, runtimeNodeParent: Node) {
		if (element.nodeNameOrRef instanceof NodeName && element.nodeNameOrRef?.value) {
			if (element.parentNode?.parentNode) {
				if (!runtimeNodeParent.hasNode(element.nodeNameOrRef.value)) {
					this._issues.push(
						genIssue(ContextIssues.NODE_DOES_NOT_EXIST, element.nodeNameOrRef)
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
					genIssue(
						ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
						element,
						DiagnosticSeverity.Error,
						[],
						[],
						[element.nodeNameOrRef.value]
					)
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
				genIssue(ContextIssues.PROPERTY_DOES_NOT_EXIST, element.propertyName)
			);
		} else if (element.propertyName?.name) {
			runtimeNodeParent.deleteProperty(element.propertyName.name, element);
		}

		element.children.forEach((child) => this.processChild(child, runtimeNodeParent));
	}
}
