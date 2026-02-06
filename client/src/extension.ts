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
				let context: ContextListItem | null = null;
				if (
					args &&
					args.scheme === CompiledDocumentProvider.scheme &&
					args.query['ctxId']
				) {
					const allCtxs = await api.getContexts();
					context =
						allCtxs.find((c) => c.id === args.query['ctxId']) ??
						null;
				} else {
					context = await SelectContext(api, args);
				}

				if (!context) return null;

				vscode.workspace
					.openTextDocument(
						vscode.Uri.parse(
							`devicetree-context-output:${context.id}.dts`,
						),
					)
					.then(vscode.window.showTextDocument);
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
It is not equivalent to the output produced by a DTS compiler and should only
be used as a reference to understand what the final compiled output might look like. */
${dts}
`;
		return message;
	}
}
