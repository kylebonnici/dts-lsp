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

import { existsSync, readFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import {
	Diagnostic,
	DiagnosticSeverity,
	DocumentLink,
	FormattingOptions,
	Position,
} from 'vscode-languageserver';
import { ASTBase } from './ast/base';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
	NodeName,
} from './ast/dtc/node';
import { DtcProperty } from './ast/dtc/property';
import { ContextIssues, FileDiagnostic, Token } from './types';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { DeleteNode } from './ast/dtc/deleteNode';
import { LabelRef } from './ast/dtc/labelRef';
import { Node } from './context/node';
import { Property } from './context/property';
import { Runtime } from './context/runtime';
import {
	generateContextId,
	genContextDiagnostic,
	isPathEqual,
	pathToFileURL,
	positionInBetween,
	toRange,
	compareWords,
	coreSyntaxIssuesFilter,
	positionBefore,
	positionAfter,
} from './helpers';
import { Parser } from './parser';
import { NodePath, NodePathRef } from './ast/dtc/values/nodePath';
import { BindingLoader } from './dtsTypes/bindings/bindingLoader';
import { StringValue } from './ast/dtc/values/string';
import { Comment } from './ast/dtc/comment';
import type { File, Context, PartialBy, ResolvedContext } from './types/index';

export class ContextAware {
	_issues: FileDiagnostic[] = [];
	private _runtime?: Promise<Runtime>;
	public parser: Parser;
	public overlayParsers: Parser[] = [];
	public overlays: string[] = [];
	public readonly id: string;
	private readonly ctxNames_ = new Set<string | number>();
	private sortKeys = new WeakMap<Token, number>();
	readonly isFullContext: boolean;

	constructor(
		readonly settings: PartialBy<Context, 'ctxName'>,
		public formattingOptions: FormattingOptions,
		public readonly bindingLoader?: BindingLoader,
	) {
		const resolvedSettings: ResolvedContext = {
			includePaths: [],
			overlays: [],
			zephyrBindings: [],
			deviceOrgTreeBindings: [],
			deviceOrgBindingsMetaSchema: [],
			...settings,
			ctxName: settings.ctxName ?? basename(settings.dtsFile),
			lockRenameEdits: [],
			showFormattingErrorAsDiagnostics:
				settings.showFormattingErrorAsDiagnostics ?? true,
			disableFileWatchers: settings.disableFileWatchers ?? false,
		};
		this.isFullContext = this.settings.dtsFile
			.toLowerCase()
			.endsWith('.dts');
		this.overlays = resolvedSettings.overlays;
		this.overlays.filter(existsSync);

		const includePaths =
			this.isFullContext && bindingLoader?.type === 'Zephyr'
				? [
						join(dirname(this.settings.dtsFile), 'dts'),
						...resolvedSettings.includePaths,
					]
				: resolvedSettings.includePaths;
		this.parser = new Parser(resolvedSettings.dtsFile, includePaths);
		this.ctxNames_.add(resolvedSettings.ctxName);
		this.id = generateContextId(resolvedSettings);
		this.parser.stable.then(() => {
			this.overlayParsers =
				this.overlays?.map(
					(overlay) =>
						new Parser(
							overlay,
							includePaths,
							this.parser.cPreprocessorParser.macros,
						),
				) ?? [];
		});
	}

	get macros() {
		return this.allParsers.at(-1)!.cPreprocessorParser.macros;
	}

	get ctxNames() {
		return Array.from(this.ctxNames_);
	}

	addCtxName(name: string | number) {
		this.ctxNames_.add(name);
	}

	removeCtxName(name: string | number) {
		this.ctxNames_.delete(name);
	}

	async getContextIssues() {
		return [...(await this.getRuntime()).issues, ...this._issues];
	}

	async getFileTree(): Promise<{ mainDtsPath: File; overlays: File[] }> {
		const temp = new Map<
			string,
			{ path: string; resolvedPath?: string }[]
		>();

		const getTreeItem = (uri: string): File => {
			return {
				file: uri,
				includes: (temp.get(uri) ?? []).map((f) =>
					getTreeItem(f.resolvedPath ?? f.path),
				),
			};
		};

		const runtime = await this.getRuntime();
		runtime.includes.forEach((include) => {
			let t = temp.get(include.uri);
			if (!t) {
				t = [];
				temp.set(include.uri, t);
			}
			t.push({
				path: include.path.path,
				resolvedPath: include.resolvedPath,
			});
		});

		return {
			mainDtsPath: getTreeItem(this.parser.uri),
			overlays: this.overlays.map(getTreeItem),
		};
	}

	async stable() {
		await Promise.all([
			this.parser.stable,
			...this.overlayParsers.map((p) => p.stable),
		]);
	}

	async getRuntime(): Promise<Runtime> {
		await this.stable();
		this._runtime ??= this.evaluate();
		return this._runtime;
	}

	getContextFiles() {
		return [
			...this.overlayParsers.flatMap((c) => c.getFiles()),
			...this.parser.getFiles(),
		];
	}

	isInContext(uri: string): boolean {
		return this.getContextFiles().some((file) => isPathEqual(file, uri));
	}

	getUriParser(uri: string) {
		let parser = this.overlayParsers.find((p) =>
			p.getFiles().some((p) => isPathEqual(p, uri)),
		);
		parser ??= this.parser.getFiles().some((p) => isPathEqual(p, uri))
			? this.parser
			: undefined;
		return parser;
	}

	async getAllStableParsers(): Promise<Parser[]> {
		await this.stable();
		return this.allParsers;
	}

	get allParsers() {
		return [this.parser, ...this.overlayParsers];
	}

	async getDocumentLinks(
		file: string,
		position?: Position,
	): Promise<DocumentLink[]> {
		if (!this.isInContext(file)) {
			return [];
		}
		const runtime = await this.getRuntime();

		const bindingLinks =
			runtime.rootNode.allBindingsProperties
				.filter(
					(p) =>
						isPathEqual(p.ast.uri, file) &&
						(!position || positionInBetween(p.ast, file, position)),
				)
				.flatMap((p) =>
					p.ast.values?.values.flatMap<DocumentLink | undefined>(
						(v) => {
							const node = p.parent;
							const nodeType = node?.nodeTypes.find(
								(t) =>
									v?.value instanceof StringValue &&
									t.compatible === v.value.value,
							);
							return nodeType
								? {
										range: toRange(v!.value!),
										target: pathToFileURL(
											nodeType.bindingsPath!,
										),
									}
								: undefined;
						},
					),
				)
				.filter((v) => !!v) ?? [];

		return [
			...(this.parser.cPreprocessorParser.dtsIncludes
				.filter(
					(include) =>
						isPathEqual(include.uri, file) &&
						(!position ||
							positionInBetween(include, file, position)),
				)
				.map((include) => {
					const path =
						this.parser.cPreprocessorParser.resolveInclude(include);
					if (path) {
						const link: DocumentLink = {
							range: toRange(include.path),
							target: pathToFileURL(path),
						};
						return link;
					}
				})
				.filter((r) => !!r) ?? []),
			...bindingLinks,
		];
	}

	private linkPropertiesLabelsAndNodePaths(runtime: Runtime) {
		const getAllProperties = (node: Node): Property[] => {
			return [
				...node.properties,
				...node.nodes.flatMap(getAllProperties),
			];
		};
		const allProperties = getAllProperties(runtime.rootNode);
		const allLabels = runtime.rootNode.allDescendantsLabels;

		allProperties.forEach((p) =>
			p.ast.allDescendants.forEach((c) => {
				if (c instanceof LabelRef) {
					const resolvesTo = runtime.resolvePath(
						[`&${c.label?.value}`],
						allLabels,
					);
					if (resolvesTo) {
						const node = runtime.rootNode.getChild(resolvesTo);
						c.linksTo = node;
						node?.linkedRefLabels.push(c);
					} else if (c.value) {
						this._issues.push(
							genContextDiagnostic(
								ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
								c.firstToken,
								c.lastToken,
								c,
								{ templateStrings: [c.value] },
							),
						);
					}
				} else if (c instanceof NodePath) {
					this.linkNodePath(c, runtime.rootNode);
				}
			}),
		);
	}

	private linkNodePath(nodePath: NodePath, rootNode: Node) {
		let node: Node | undefined = rootNode;
		const paths = nodePath.pathParts;
		for (let i = 0; i < paths.length && paths[i]; i++) {
			let issueFound = false;
			const nodeName = paths[i];

			if (nodeName) {
				const child: Node | undefined =
					i === 0 && nodeName.name === '/'
						? rootNode
						: node?.getNode(
								nodeName.name,
								nodeName.fullAddress,
								false,
							);
				nodeName.linksTo = child;
				if (!issueFound && !child) {
					issueFound = true;

					this._issues.push(
						genContextDiagnostic(
							ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
							nodeName.firstToken,
							nodeName.lastToken,
							nodeName,
							{
								templateStrings: [
									nodeName.toString(),
									`${nodePath.pathParts
										.filter((p) => p?.linksTo)
										.map((p) => p?.toString())
										.join('/')}`,
								],
							},
						),
					);
				}
				child?.linkedNodeNamePaths.push(nodeName);
				node = child;
			} else {
				break;
			}
		}
	}

	private staleUri = new Set<string>();
	setStaleUri(uri: string) {
		this.staleUri.add(uri);
	}

	public async reevaluate(uri: string) {
		this.setStaleUri(uri);
		const parsers = new Set<Parser>();
		this.staleUri.forEach((u) => {
			const staleParser = this.getUriParser(u);
			if (staleParser) {
				parsers.add(staleParser);
			}
		});

		if (!parsers.size) return this._runtime;

		this.sortKeys = new WeakMap<Token, number>();
		await Promise.all(Array.from(parsers).map((v) => v.reparse()));

		this._runtime = this.evaluate();
		return this._runtime;
	}

	public getSortKey(obj: ASTBase | undefined) {
		if (!obj) return undefined;

		let key = this.sortKeys.get(obj.firstToken);
		if (key) return key;
	}

	public async evaluate() {
		const t = performance.now();
		await this.stable();

		const runtime = new Runtime(this);
		this.staleUri.clear();
		this._issues = [];

		this.parser.rootDocument.resetIssues();
		this.processRoot(this.parser.rootDocument, runtime);
		for (let i = 0; i < this.overlayParsers.length; i++) {
			this.overlayParsers[i].rootDocument.resetIssues();
			this.processRoot(this.overlayParsers[i].rootDocument, runtime);
		}

		runtime.includes = this.parser.includes;
		runtime.comments = this.parser.cPreprocessorParser.allAstItems.filter(
			(a) => a instanceof Comment,
		);

		(await this.getAllStableParsers())
			.flatMap((p) => p.tokens)
			.forEach((t, i) => this.sortKeys.set(t, i));

		this.linkPropertiesLabelsAndNodePaths(runtime);
		this.reportNodeNameAndPropertyClashes(runtime);

		console.log(`(ID: ${this.id}) evaluate`, performance.now() - t);
		return runtime;
	}

	public getSortKeyFile(position: Position, fsPath: string) {
		let token = this.findTokenBeforePosition(position, fsPath);
		let key = token ? this.sortKeys.get(token) : undefined;
		while (token && !key) {
			token = token.prevToken;
			key = token ? this.sortKeys.get(token) : undefined;
		}

		return key;
	}

	private findTokenBeforePosition(position: Position, fsPath: string) {
		const meta = [this.parser, ...this.overlayParsers].flatMap((p) => ({
			parser: p,
			tokens: p.tokens,
		}));

		for (const [index, item] of meta.entries()) {
			// empty overly or empty main board file
			if (item.tokens.length === 0 && item.parser.uri === fsPath) {
				const prev = meta[index - 1];
				return index ? prev.tokens[prev.tokens.length - 1] : null;
			}

			const found = item.tokens.find(
				(tt) =>
					positionAfter(tt, fsPath, position) &&
					(!tt.nextToken ||
						positionBefore(tt.nextToken, fsPath, position)),
			);

			if (found) {
				return found;
			}

			const includeFile = item.parser.includes.find(
				(i) => i.resolvedPath === fsPath,
			);

			if (includeFile) {
				return includeFile.firstToken;
			}
		}
	}

	private reportNodeNameAndPropertyClashes(runtime: Runtime) {
		const processNode = (node: Node) => {
			node.properties.forEach((p) => {
				const conflictingNodes = node.nodes.filter(
					(n) =>
						n.address === undefined &&
						n.name === p.ast.propertyName?.name &&
						n.definitions.at(-1)?.name,
				);

				conflictingNodes.forEach((n) => {
					const definitions = n.definitions;
					const name = definitions[definitions.length - 1].name!;
					this._issues.push(
						genContextDiagnostic(
							ContextIssues.DUPLICATE_NODE_NAME,
							name.firstToken,
							name.lastToken,
							name,
							{
								linkedTo: [
									p.ast,
									...p.allReplaced.map((pp) => pp.ast),
								],
							},
						),
					);
				});
			});
			node.nodes.forEach(processNode);
		};
		processNode(runtime.rootNode);
	}

	private processRoot(element: DtcBaseNode, runtime: Runtime) {
		for (let i = 0; i < element.children.length; i++) {
			const child = element.children[i];
			this.processChild(child, runtime.rootNode, runtime);
		}
	}

	private processChild(
		element: ASTBase,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (element instanceof DtcBaseNode) {
			this.processDtcBaseNode(element, runtimeNodeParent, runtime);
		} else if (element instanceof DtcProperty) {
			this.processDtcProperty(element, runtimeNodeParent, runtime);
		} else if (element instanceof DeleteNode) {
			this.processDeleteNode(element, runtimeNodeParent, runtime);
		} else if (element instanceof DeleteProperty) {
			this.processDeleteProperty(element, runtimeNodeParent, runtime);
		}
	}

	private checkNodeUniqueNames(
		element: DtcBaseNode,
		runtimeNodeParent: Node,
	) {
		const checkMatch = (
			values: { name: string; address?: number[]; issueAst: ASTBase }[],
			nodeName: NodeName,
		) => {
			return values
				.filter(
					(i) =>
						i.name === nodeName.name &&
						((i.address === nodeName.fullAddress &&
							i.address === undefined) ||
							compareWords(
								i.address ?? [],
								nodeName.fullAddress ?? [],
							) === 0),
				)
				.map((n) => n.issueAst);
		};
		const fullNames: {
			name: string;
			address?: number[];
			issueAst: ASTBase;
		}[] = runtimeNodeParent.nodes.map((n) => {
			const definition = n.definitions[0];
			return {
				name: n.name,
				address: n.address,
				issueAst: definition.name ?? definition,
			};
		});

		let names: NodeName[] = [];

		element.children.forEach((child) => {
			if (child instanceof DtcChildNode && child.name) {
				const conflictingNames = checkMatch(
					names.map((n) => ({
						name: n.name,
						address: n.fullAddress,
						issueAst: n,
					})),
					child.name,
				);

				if (conflictingNames.length) {
					this._issues.push(
						genContextDiagnostic(
							ContextIssues.DUPLICATE_NODE_NAME,
							child.name.firstToken,
							child.name.lastToken,
							child.name,
							{ linkedTo: conflictingNames },
						),
					);
				}

				names.push(child.name);
			} else if (
				child instanceof DeleteNode &&
				child.nodeNameOrRef instanceof NodeName
			) {
				const nodeName = child.nodeNameOrRef;
				if (checkMatch(fullNames, nodeName)) {
					names = names.filter(
						(i) =>
							checkMatch(
								names.map((n) => ({
									name: n.name,
									address: n.fullAddress,
									issueAst: n,
								})),
								i,
							).length,
					);
				}
			}
		});
	}

	getCompileCommands() {
		if (
			!this.settings.compileCommands ||
			!existsSync(this.settings.compileCommands)
		) {
			return;
		}

		return JSON.parse(
			readFileSync(this.settings.compileCommands).toString(),
		) as {
			directory: string;
			command: string;
			file: string;
		}[];
	}

	private processDtcBaseNode(
		element: DtcBaseNode,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (element instanceof DtcRootNode) {
			this.processDtcRootNode(element, runtime);
		} else if (element instanceof DtcChildNode) {
			this.processDtcChildNode(element, runtimeNodeParent, runtime);
		} else if (element instanceof DtcRefNode) {
			this.processDtcRefNode(element, runtime);
		}
	}

	private processDtcRootNode(element: DtcRootNode, runtime: Runtime) {
		runtime.rootNode.implementations.push(element);
		this.checkNodeUniqueNames(element, runtime.rootNode);
		element.children.forEach((child) =>
			this.processChild(child, runtime.rootNode, runtime),
		);
	}

	private processDtcChildNode(
		element: DtcChildNode,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (element.name?.name) {
			const resolvedPath = element.path
				? runtime.resolvePath(element.path)
				: undefined;
			const runtimeNode = resolvedPath
				? runtime.rootNode.getChild(resolvedPath)
				: undefined;

			const child =
				runtimeNode ??
				new Node(
					this.bindingLoader,
					element.name.name,
					element.name.fullAddress,
					runtimeNodeParent,
				);
			child.implementations.push(element);
			element.labels.forEach((l) => (l.lastLinkedTo = child));

			runtimeNodeParent = child;
			this.checkNodeUniqueNames(element, child);
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNodeParent, runtime),
		);
	}

	private processDtcRefNodeLabelRef(
		element: DtcRefNode,
		reference: LabelRef,
		runtime: Runtime,
	) {
		let runtimeNode: Node | undefined;

		const resolvedPath =
			element.resolveNodePath ??
			(element.pathName
				? runtime.resolvePath([element.pathName])
				: undefined);
		if (!resolvedPath) {
			this._issues.push(
				genContextDiagnostic(
					ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
					reference.firstToken,
					reference.lastToken,
					reference,
					{ templateStrings: [reference.label?.value ?? ''] },
				),
			);
			runtime.unlinkedRefNodes.push(element);
		} else {
			element.resolveNodePath ??= [...resolvedPath];
			runtimeNode = runtime.rootNode.getChild(resolvedPath);
			reference.linksTo = runtimeNode;
			element.labels.forEach((l) => (l.lastLinkedTo = runtimeNode));
			runtimeNode?.linkedRefLabels.push(reference);
			runtimeNode?.implementations.push(element);

			element.labels.forEach((label) => {
				runtime.labelsUsedCache.set(label.label.value, resolvedPath);
			});

			if (runtimeNode) {
				runtime.references.push(element);
				this.checkNodeUniqueNames(element, runtimeNode);
			} else {
				runtime.unlinkedRefNodes.push(element);
			}
		}

		return runtimeNode;
	}

	private processDtcRefNodeNodePathRef(
		element: DtcRefNode,
		reference: NodePathRef,
		runtime: Runtime,
	) {
		let runtimeNode: Node | undefined;

		if (reference.path) {
			this.linkNodePath(reference.path, runtime.rootNode);
		}

		const linksTo = reference.path?.pathParts.at(-1)?.linksTo;
		const resolvedPath = linksTo?.path;

		if (!resolvedPath) {
			runtime.unlinkedRefNodes.push(element);
		} else {
			element.resolveNodePath ??= resolvedPath;
			runtimeNode = runtime.rootNode.getChild(resolvedPath);
			element.labels.forEach((l) => (l.lastLinkedTo = runtimeNode));
			runtimeNode?.implementations.push(element);

			element.labels.forEach((label) => {
				runtime.labelsUsedCache.set(label.label.value, resolvedPath);
			});

			if (runtimeNode) {
				runtime.references.push(element);
				this.checkNodeUniqueNames(element, runtimeNode);
			} else {
				runtime.unlinkedRefNodes.push(element);
			}
		}

		return runtimeNode;
	}

	private processDtcRefNode(element: DtcRefNode, runtime: Runtime) {
		let runtimeNode: Node | undefined;

		if (element.reference) {
			if (element.reference instanceof LabelRef) {
				runtimeNode = this.processDtcRefNodeLabelRef(
					element,
					element.reference,
					runtime,
				);
			} else {
				runtimeNode = this.processDtcRefNodeNodePathRef(
					element,
					element.reference,
					runtime,
				);
			}
		} else {
			runtime.unlinkedRefNodes.push(element);
		}

		element.children.forEach((child) =>
			this.processChild(
				child,
				runtimeNode ?? new Node(this.bindingLoader, ''),
				runtime,
			),
		);
	}

	private processDtcProperty(
		element: DtcProperty,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (element.propertyName?.name) {
			runtimeNodeParent.addProperty(
				new Property(element, runtimeNodeParent),
			);
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNodeParent, runtime),
		);
	}

	private processDeleteNode(
		element: DeleteNode,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (
			element.nodeNameOrRef instanceof NodeName &&
			element.nodeNameOrRef.value
		) {
			if (element.parentNode?.parentNode) {
				if (
					!runtimeNodeParent.hasNode(
						element.nodeNameOrRef.name,
						element.nodeNameOrRef.fullAddress,
					)
				) {
					this._issues.push(
						genContextDiagnostic(
							ContextIssues.NODE_DOES_NOT_EXIST,
							element.nodeNameOrRef.firstToken,
							element.nodeNameOrRef.lastToken,
							element.nodeNameOrRef,
						),
					);
				} else {
					runtimeNodeParent.deletes.push(element);
					const nodeToBeDeleted = runtimeNodeParent.getNode(
						element.nodeNameOrRef.name,
						element.nodeNameOrRef.fullAddress,
					);
					element.nodeNameOrRef.linksTo = nodeToBeDeleted;
					runtimeNodeParent.deleteNode(
						element.nodeNameOrRef.name,
						element,
						element.nodeNameOrRef.fullAddress,
					);

					nodeToBeDeleted?.labels.forEach((label) => {
						runtime.labelsUsedCache.delete(label.label.value);
					});
				}
			}
		} else if (
			element.nodeNameOrRef instanceof LabelRef &&
			element.nodeNameOrRef.value
		) {
			const resolvedPath = runtime.resolvePath([
				`&${element.nodeNameOrRef.value}`,
			]);

			let runtimeNode: Node | undefined;
			if (!resolvedPath) {
				runtime.unlinkedDeletes.push(element);
				this._issues.push(
					genContextDiagnostic(
						ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
						element.nodeNameOrRef.firstToken,
						element.nodeNameOrRef.lastToken,
						element.nodeNameOrRef,
						{ templateStrings: [element.nodeNameOrRef.value] },
					),
				);
			} else {
				runtimeNode = runtime.rootNode.getChild(resolvedPath);
				runtimeNodeParent.deletes.push(element);
				element.nodeNameOrRef.linksTo = runtimeNode;

				runtimeNode?.labels.forEach((label) => {
					runtime.labelsUsedCache.delete(label.label.value);
				});

				runtimeNode?.linkedRefLabels.push(element.nodeNameOrRef);
				runtimeNode?.parent?.deleteNode(
					runtimeNode.name,
					element,
					runtimeNode.address,
				);

				if (
					element.parentNode instanceof DtcBaseNode &&
					!element.parentNode.pathName
				) {
					runtime.globalDeletes.push(element);
				}
			}
		} else if (
			element.nodeNameOrRef instanceof NodePathRef &&
			element.nodeNameOrRef.path &&
			!element.nodeNameOrRef.path.pathParts.some((p) => !p)
		) {
			let node: Node | undefined = runtime.rootNode;
			const paths = element.nodeNameOrRef.path.pathParts;
			for (let i = 0; i < paths.length && paths[i]; i++) {
				const nodePath = paths[i];

				if (nodePath) {
					const child: Node | undefined = node?.getNode(
						nodePath.name,
						nodePath.fullAddress,
						false,
					);
					nodePath.linksTo = child;
					child?.linkedNodeNamePaths.push(nodePath);
					node = child;
				}
			}

			const unresolvedNodeName =
				element.nodeNameOrRef.path.pathParts.find(
					(p) => p && !p.linksTo,
				);

			const runtimeNode =
				element.nodeNameOrRef.path.pathParts.at(-1)?.linksTo;

			if (!runtimeNode) {
				runtime.unlinkedDeletes.push(element);
				if (unresolvedNodeName) {
					this._issues.push(
						genContextDiagnostic(
							ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
							unresolvedNodeName.firstToken,
							unresolvedNodeName.lastToken,
							unresolvedNodeName,
							{
								templateStrings: [
									unresolvedNodeName.toString(),
									`${element.nodeNameOrRef.path.pathParts
										.filter((p) => p?.linksTo)
										.map((p) => p?.toString())
										.join('/')}`,
								],
							},
						),
					);
				}
			}
			runtimeNodeParent.deletes.push(element);

			runtimeNode?.labels.forEach((label) => {
				runtime.labelsUsedCache.delete(label.label.value);
			});

			runtimeNode?.parent?.deleteNode(
				runtimeNode.name,
				element,
				runtimeNode.address,
			);

			if (
				element.parentNode instanceof DtcBaseNode &&
				!element.parentNode.pathName
			) {
				runtime.globalDeletes.push(element);
			}
		} else {
			runtime.unlinkedDeletes.push(element);
		}
		element.children.forEach((child) =>
			this.processChild(child, runtimeNodeParent, runtime),
		);
	}

	private processDeleteProperty(
		element: DeleteProperty,
		runtimeNodeParent: Node,
		runtime: Runtime,
	) {
		if (
			element.propertyName?.name &&
			!runtimeNodeParent.hasProperty(element.propertyName.name)
		) {
			this._issues.push(
				genContextDiagnostic(
					ContextIssues.PROPERTY_DOES_NOT_EXIST,
					element.propertyName.firstToken,
					element.propertyName.lastToken,
					element.propertyName,
				),
			);
		} else if (element.propertyName?.name) {
			runtimeNodeParent.deletes.push(element);
			runtimeNodeParent.deleteProperty(
				element.propertyName.name,
				element,
			);
		}

		element.children.forEach((child) =>
			this.processChild(child, runtimeNodeParent, runtime),
		);
	}

	static #add(
		diagnostic: Diagnostic,
		uri: string,
		map: Map<string, Diagnostic[]>,
	) {
		let list: Diagnostic[] | undefined = map.get(uri);
		if (!list) {
			list = [];
			map.set(uri, list);
		}
		list.push(diagnostic);
	}

	private getIssues(
		issues: FileDiagnostic[],
		result = new Map<string, Diagnostic[]>(),
		transform: (issue: FileDiagnostic) => FileDiagnostic | undefined = (
			i,
		) => {
			if (i.raw.severity === DiagnosticSeverity.Hint && i.raw.virtual) {
				return;
			}

			if (
				i.raw.severity === DiagnosticSeverity.Error &&
				!this.isFullContext
			) {
				i.raw.severity = DiagnosticSeverity.Warning;
			}

			return i;
		},
	): Map<string, Diagnostic[]> {
		issues.forEach((issue) => {
			const i = transform(issue);
			if (i) {
				ContextAware.#add(i.diagnostic(), i.raw.uri, result);
			}
		});

		return result;
	}

	async getSyntaxIssues(
		result = new Map<string, Diagnostic[]>(),
		transform: (issue: FileDiagnostic) => FileDiagnostic | undefined = (
			issue,
		) => {
			if (
				issue.raw.severity === DiagnosticSeverity.Error &&
				!this.isFullContext &&
				!coreSyntaxIssuesFilter(issue.raw, issue.raw.uri, false)
			) {
				issue.raw.severity = DiagnosticSeverity.Warning;
			}

			if (
				issue.raw.severity === DiagnosticSeverity.Hint &&
				issue.raw.virtual
			) {
				return;
			}

			return issue;
		},
	): Promise<Map<string, Diagnostic[]>> {
		(await this.getAllStableParsers()).forEach((parser) => {
			return this.getIssues(parser.issues, result, transform);
		});

		return result;
	}

	async getDiagnostics(): Promise<Map<string, Diagnostic[]>> {
		const result = new Map<string, Diagnostic[]>();

		try {
			await this.getSyntaxIssues(result);

			const contextIssues = (await this.getContextIssues()) ?? [];
			this.getIssues(contextIssues, result);

			const runtime = await this.getRuntime();
			this.getIssues(runtime.typesIssues, result);

			return result;
		} catch (e) {
			console.error(e);
			throw e;
		}
	}

	async toFullString() {
		return `/dts-v1/;\n\n${(await this.getRuntime()).rootNode.toFullString(
			(await this.getAllStableParsers()).at(-1)!.cPreprocessorParser
				.macros,
			this.settings.cwd,
		)}`;
	}
	async serialize() {
		// make sure we have context issues generated
		await this.stable;
		await this.getDiagnostics();
		return (await this?.getRuntime())?.rootNode.serialize(
			(await this.getAllStableParsers()).at(-1)!.cPreprocessorParser
				.macros,
		);
	}
}
