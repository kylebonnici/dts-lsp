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

import * as path from 'path';
import * as vscode from 'vscode';

import {
	LanguageClient,
	LanguageClientOptions,
	ServerOptions,
	TextDocumentPositionParams,
	TransportKind,
} from 'vscode-languageclient/node';
import {
	ClipboardActions,
	ContextListItem,
} from 'devicetree-language-server-types';
import { API } from './api';
import { getCurrentTextDocumentPositionParams } from './helpers';

const isPathEqual = (pathA: string | undefined, pathB: string | undefined) => {
	if (!pathA || !pathB) return false;

	return pathA === pathB;
};

const doesContextUsesFile = (ctx: ContextListItem, filePath: string) => {
	return (
		isPathEqual(ctx.mainDtsPath.file, filePath) ||
		ctx.mainDtsPath.includes.some((include) =>
			isPathEqual(include.file, filePath),
		) ||
		ctx.overlays.some(
			(overlay) =>
				isPathEqual(overlay.file, filePath) ||
				overlay.includes.some((include) =>
					isPathEqual(include.file, filePath),
				),
		)
	);
};

const SelectContext = async (
	api: API,
	uri?: vscode.Uri,
): Promise<ContextListItem | null> => {
	const quickPick = vscode.window.createQuickPick<
		vscode.QuickPickItem & {
			id: string;
			ctx: ContextListItem;
		}
	>();

	const contexts = await api.getContexts();

	const contextToUse = uri
		? contexts.filter((c) => doesContextUsesFile(c, uri.fsPath))
		: contexts;

	quickPick.items = contextToUse.map((context) => ({
		id: context.id,
		ctx: context,
		label: `[${context.ctxNames.join(',')}]`,
		description: `[${context.type} context] dts: ${path.basename(
			context.mainDtsPath.file,
		)}`,
		detail: context.overlays.length
			? ` overlays: ${context.overlays
					.map((overlay) => path.basename(overlay.file))
					.join(', ')}`
			: '',
	}));

	if (quickPick.items.length === 1) {
		return contexts[0];
	}

	quickPick.activeItems = quickPick.items.filter((i) => i.ctx.active);
	quickPick.placeholder = 'Select devicetree context';

	quickPick.show();

	return new Promise<ContextListItem | null>((resolve) => {
		quickPick.show();

		const hideDisposable = quickPick.onDidHide(() => {
			resolve(null);
		});

		quickPick.onDidAccept(() => {
			if (quickPick.selectedItems.length === 1) {
				hideDisposable.dispose();
				resolve(quickPick.selectedItems[0].ctx);
			}
			quickPick.dispose();
		});
	});
};

let client: LanguageClient;
let api: API;

const generateContextOutputUri = async (args: vscode.Uri) => {
	let context: ContextListItem | null = null;
	const query: Record<string, string> = {};
	if (args?.query) {
		args?.query.split('&').forEach((part) => {
			const parts = part.split('=');
			query[parts[0]] = parts.at(1) ?? '';
		});
	}

	if (
		args &&
		args.scheme === CompiledDocumentProvider.scheme &&
		query['ctxId']
	) {
		const allCtxs = await api.getContexts();
		context = allCtxs.find((c) => c.id === query['ctxId']) ?? null;
	} else {
		context = await SelectContext(api, args);
	}

	if (!context) return null;

	return {
		uri: vscode.Uri.parse(`devicetree-context-output:${context.id}.dts`),
		besides: !!query['beside'],
	};
};

const openContextOutput = async (
	compiledDocumentProvider: CompiledDocumentProvider,
	result: Awaited<ReturnType<typeof generateContextOutputUri>>,
) => {
	const { uri, besides } = result;

	const alreadyOpen = vscode.workspace.textDocuments.some(
		(doc) => doc.uri.toString() === uri.toString(),
	);

	if (alreadyOpen) {
		compiledDocumentProvider.update(uri);
	} else {
		await vscode.workspace.openTextDocument(uri);
	}

	await vscode.window.showTextDocument(
		uri,
		besides ? { viewColumn: vscode.ViewColumn.Beside } : {},
	);
};

export async function activate(context: vscode.ExtensionContext) {
	// The server is implemented in node
	const serverModule = context.asAbsolutePath(
		path.join('server', 'dist', 'server.js'),
	);

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	const serverOptions: ServerOptions = {
		run: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
		},
	};

	// Options to control the language client
	const clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [
			{ scheme: 'file', language: 'devicetree' },
			{ scheme: 'file', language: 'yaml' },
			{ scheme: 'file', language: 'c' },
			{ scheme: 'file', language: 'cpp' },
		],
		synchronize: {
			configurationSection: 'devicetree',
			fileEvents: [
				vscode.workspace.createFileSystemWatcher('**/*.dts'),
				vscode.workspace.createFileSystemWatcher('**/*.dtsi'),
				vscode.workspace.createFileSystemWatcher('**/*.dtso'),
				vscode.workspace.createFileSystemWatcher('**/*.overlay'),
			],
		},
	};

	// Create the language client and start the client.
	client = new LanguageClient(
		'devicetree',
		'devicetree',
		serverOptions,
		clientOptions,
	);

	// Start the client. This will also launch the server
	await client.start();

	api = new API(client);
	const compiledDocumentProvider = new CompiledDocumentProvider();

	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			if (editor && ['devicetree'].includes(editor.document.languageId)) {
				api.setActiveFileUri(editor.document.uri.fsPath);
			}
		}),
		vscode.workspace.registerTextDocumentContentProvider(
			CompiledDocumentProvider.scheme,
			compiledDocumentProvider,
		),
		vscode.commands.registerCommand(
			'devicetree.context.set.active',
			async () => {
				const context = await SelectContext(api);
				if (context) api.setActiveContextById(context.id);
			},
		),
		vscode.commands.registerCommand(
			'devicetree.context.output.generate',
			async (args?: vscode.Uri) => {
				const result = await generateContextOutputUri(args);
				if (!result) return;

				await openContextOutput(compiledDocumentProvider, result);
			},
		),
		vscode.commands.registerCommand(
			'devicetree.context.output.generate.beside',
			async (args?: vscode.Uri) => {
				const result = await generateContextOutputUri(args);
				if (!result) return;

				result.besides = true;

				await openContextOutput(compiledDocumentProvider, result);
			},
		),
		vscode.commands.registerCommand(
			'devicetree.context.output.update',
			async (args?: vscode.Uri) => {
				if (!args) return;
				compiledDocumentProvider.update(args);
			},
		),
		vscode.commands.registerCommand(
			'devicetree.clipboard.dtMacro',
			async (textDocumentPositionParams?: TextDocumentPositionParams) => {
				const actions = (
					await api.getAllowedActions(
						textDocumentPositionParams ??
							(await getCurrentTextDocumentPositionParams()),
					)
				).filter(
					(a): a is ClipboardActions =>
						a.type === 'dt_zephyr_macro_prop_node_label' ||
						a.type === 'dt_zephyr_macro_prop_node_path' ||
						a.type === 'dt_zephyr_macro_node_path' ||
						a.type === 'dt_zephyr_macro_node_label' ||
						a.type === 'dt_zephyr_macro_prop_node_alias',
				);

				copyClipboardAction(actions, 'Pick a macro to copy...');
			},
		),
		vscode.window.onDidChangeTextEditorSelection((e) => {
			if (!['devicetree'].includes(e.textEditor.document.languageId)) {
				return;
			}
			api.getActivePathLocation();
		}),
		vscode.commands.registerCommand(
			'devicetree.clipboard.nodePath',
			async () => {
				const actions = (
					await api.getAllowedActions(
						await getCurrentTextDocumentPositionParams(),
					)
				).filter((a): a is ClipboardActions => a.type === 'path');

				copyClipboardAction(actions, 'Pick a path to copy...');
			},
		),
		vscode.commands.registerCommand(
			'devicetree.context.memoryViews',
			async () => {
				const context = await SelectContext(api);
				if (context) {
					const data = (await api.getMemoryViews(
						context.id,
					)) as AddressDomain[];

					await vscode.window.showTextDocument(
						await vscode.workspace.openTextDocument({
							content: JSON.stringify(data, null, 2),
							language: 'json', // change to 'typescript', 'json', etc.
						}),
					);
					await vscode.window.showTextDocument(
						await vscode.workspace.openTextDocument({
							content: renderAllDomains(data),
							language: 'plaintext', // change to 'typescript', 'json', etc.
						}),
					);
				}
			},
		),
	);

	api.onActiveContextChange((ctx) => {
		vscode.commands.executeCommand(
			'setContext',
			'devicetree.context.type',
			ctx?.settings.bindingType,
		);
	});

	return api;
}

const copyClipboardAction = async (
	actions: ClipboardActions[],
	placeHolder: string,
) => {
	if (!actions.length) {
		vscode.window.showWarningMessage('Nothing was copied');
		return;
	}

	const picked =
		actions.length > 1
			? await vscode.window.showQuickPick(
					actions.map((a) => a.data),
					{ placeHolder },
				)
			: actions[0].data;

	if (!picked) return;

	vscode.env.clipboard.writeText(picked);
	vscode.window.showInformationMessage(`Copied to clipboard: "${picked}"`);
};

export function deactivate(): Thenable<void> | undefined {
	if (!client) {
		return undefined;
	}
	return client.stop();
}

class CompiledDocumentProvider implements vscode.TextDocumentContentProvider {
	static scheme = 'devicetree-context-output';
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	public readonly onDidChange = this._onDidChange.event;

	public update(uri: vscode.Uri) {
		this._onDidChange.fire(uri);
	}

	async provideTextDocumentContent(args: vscode.Uri) {
		const dts = await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Generating Compiled Output ...',
				cancellable: false,
			},
			async () => {
				const result = await api.compiledOutput(
					path.basename(args.fsPath, '.dts'),
				);

				return result;
			},
		);

		const message = `/* This content was automatically generated by the dts-lsp language server.
 * It is not equivalent to the output produced by a DTS compiler and should only
 * be used as a reference to understand what the final compiled output might look like.
 */
${dts}
`;
		return message;
	}
}
interface Partition {
	nodePath: string;
	start: number[];
	startStrHex: string;
	size: number[];
	sizeStrHex: string;
}

interface AddressDomain {
	name: string;
	partitions: Partition[];
}

interface TreeNode {
	name: string;
	children: Map<string, TreeNode>;

	// metadata
	start?: number;
	end?: number;
	size?: number;
}

/**
 * Builds a tree for a given domain.
 * Every domain always becomes the root, with its partitions inserted as children.
 */
export function buildTreeForDomain(domain: AddressDomain): TreeNode {
	const root: TreeNode = {
		name: domain.name,
		children: new Map(),
	};

	for (const partition of domain.partitions) {
		const start = partition.start[0] ?? 0;
		const size = partition.size[0] ?? 0;
		const end = start + size;

		insertRelativePath(root, domain.name, partition.nodePath, start, end);
	}

	computeAggregateRanges(root);

	return root;
}

/**
 * Inserts a full path under the root, splitting by '/' and creating missing nodes.
 */
function insertRelativePath(
	root: TreeNode,
	domainRootPath: string,
	fullPath: string,
	start: number,
	end: number,
) {
	let relative = fullPath;

	if (fullPath.startsWith(domainRootPath)) {
		relative = fullPath.slice(domainRootPath.length);
	}

	let parts = relative.split('/').filter(Boolean);

	// If there’s no relative path, create a child using the last segment of fullPath
	if (parts.length === 0) {
		const segments = fullPath.split('/').filter(Boolean);
		parts = [segments[segments.length - 1]]; // last segment
	}

	let current = root;

	for (const part of parts) {
		if (!current.children.has(part)) {
			current.children.set(part, {
				name: part,
				children: new Map(),
			});
		}

		current = current.children.get(part)!;
	}

	current.start = start;
	current.end = end;
	current.size = end - start;
}
/**
 * Recursively computes the aggregate start/end/size from children if not already set.
 */
function computeAggregateRanges(node: TreeNode): void {
	for (const child of node.children.values()) {
		computeAggregateRanges(child);
	}

	if (node.children.size > 0) {
		const childrenWithRange = Array.from(node.children.values()).filter(
			(c) => c.start !== undefined && c.end !== undefined,
		);

		if (childrenWithRange.length > 0) {
			const minStart = Math.min(
				...childrenWithRange.map((c) => c.start!),
			);
			const maxEnd = Math.max(...childrenWithRange.map((c) => c.end!));

			node.start =
				node.start !== undefined
					? Math.min(node.start, minStart)
					: minStart;
			node.end =
				node.end !== undefined ? Math.max(node.end, maxEnd) : maxEnd;
			node.size = node.end - node.start;
		}
	}
}

/**
 * Renders a tree into a string representation.
 */
export function renderTree(node: TreeNode): string {
	let output = `${node.name}\n`;

	const children = sortChildren(node);

	children.forEach((child, index) => {
		const isLast = index === children.length - 1;
		output += renderNode(child, '', isLast);
	});

	return output;
}

function renderNode(node: TreeNode, prefix: string, isLast: boolean): string {
	const connector = isLast ? '└─ ' : '├─ ';
	let output =
		prefix +
		connector +
		node.name +
		` [start: 0x${node.start.toString(16)}, size: 0x${node.size.toString(16)}]` +
		'\n';

	const children = sortChildren(node);
	const newPrefix = prefix + (isLast ? '   ' : '│  ');

	children.forEach((child, index) => {
		const childIsLast = index === children.length - 1;
		output += renderNode(child, newPrefix, childIsLast);
	});

	return output;
}

function sortChildren(node: TreeNode): TreeNode[] {
	return Array.from(node.children.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

/**
 * Renders all domains as separate trees, joined by blank lines.
 */
export function renderAllDomains(domains: AddressDomain[]): string {
	return domains
		.map((domain) => {
			const tree = buildTreeForDomain(domain);
			return renderTree(tree);
		})
		.join('\n\n');
}
