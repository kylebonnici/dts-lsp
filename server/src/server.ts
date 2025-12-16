#!/usr/bin/env node
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

import { basename, dirname, join } from 'path';
import {
	createConnection,
	TextDocuments,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	SemanticTokensBuilder,
	CodeActionKind,
	WorkspaceDocumentDiagnosticReport,
	WorkspaceSymbol,
	DiagnosticSeverity,
	Range,
	Position,
	PublishDiagnosticsParams,
	Location,
	WorkspaceFolder,
	DocumentFormattingParams,
	TextEdit,
	Diagnostic,
	FormattingOptions,
	DocumentRangeFormattingParams,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	ContextId,
	SearchableResult,
	tokenModifiers,
	tokenTypes,
} from './types';
import {
	coreSyntaxIssuesFilter,
	evalExp,
	expandMacros,
	fileURLToPath,
	findContext,
	findContexts,
	generateContextId,
	isPathEqual,
	nodeFinder,
	pathToFileURL,
	resolveContextFiles,
} from './helpers';
import { ContextAware } from './runtimeEvaluator';
import { getCompletions } from './getCompletions';
import { getCompletions as getDtMacroCompletions } from './dtMacro/completions/getCompletions';
import { getReferences } from './findReferences';
import { getTokenizedDocumentProvider } from './providers/tokenizedDocument';
import { getPrepareRenameRequest, getRenameRequest } from './getRenameRequest';
import { getDefinitions } from './findDefinitions';
import { getDefinitions as getDTMacroDefinitions } from './dtMacro/definitions/findDefinitions';
import { getDeclaration } from './findDeclarations';
import { getDeclaration as getDTMacroDeclaration } from './dtMacro/declarations/findDeclarations';
import { getCodeActions } from './getCodeActions';
import { formatText } from './formatting/getDocumentFormatting';
import { getTypeCompletions } from './getTypeCompletions';
import { getHover } from './getHover';
import { getHover as getDTMacroHover } from './dtMacro/hover/getHover';
import { getBindingLoader } from './dtsTypes/bindings/bindingLoader';
import { getFoldingRanges } from './foldingRanges';
import { typeDefinition } from './typeDefinition';
import { FileWatcher } from './fileWatcher';
import type {
	Context,
	ContextListItem,
	ContextType,
	EvaluatedMacro,
	IntegrationSettings,
	LocationResult,
	ResolvedContext,
	SerializedNode,
	Settings,
} from './types/index';
import {
	defaultSettings,
	fixSettingsTypes,
	resolveContextSetting,
	resolveSettings,
} from './settings';
import { getActions } from './getActions';
import { getSignatureHelp } from './signatureHelp';
import { initHeapMonitor } from './heapMonitor';
import { Node } from './context/node';

const contextAware: ContextAware[] = [];
let activeContext: ContextAware | undefined;
let activeFileUri: string | undefined;
const debounce = new WeakMap<
	ContextAware,
	{ abort: AbortController; promise: Promise<void> }
>();
const fileWatchers = new Map<string, FileWatcher>();

initHeapMonitor();

const lastSavedFileVersion = new Map<string, number>();

const watchContextFiles = (context: ContextAware) => {
	if (context.settings.disableFileWatchers) {
		return;
	}
	context.getContextFiles().forEach((file) => {
		if (!fileWatchers.has(file)) {
			fileWatchers.set(
				file,
				new FileWatcher(file, onChange, () => {
					const doc = fetchDocument(file);
					const lastSavedVersion = lastSavedFileVersion.get(file);

					if (!doc || lastSavedVersion === undefined) {
						return false;
					}

					return lastSavedVersion !== doc.version;
				}),
			);
		}
		fileWatchers.get(file)?.watch();
	});
};

const deleteContext = async (context: ContextAware) => {
	const index = contextAware.indexOf(context);
	if (index === -1) {
		return;
	}

	clearWorkspaceDiagnostics(context, undefined, true);
	debounce.delete(context);
	console.log(
		`(ID: ${context.id}) cleaning Context for [${context.ctxNames.join(',')}]`,
	);

	const meta = await contextMeta(context);

	connection.sendNotification('devicetree/contextDeleted', {
		ctxNames: context.ctxNames.map((c) => c.toString()),
		id: context.id,
		...(await context.getFileTree()),
		settings: context.settings,
		active: activeContext === context,
		type: meta.type,
	} satisfies ContextListItem);
	contextAware.splice(index, 1);

	await reportContextList();

	if (context === activeContext) {
		activeContext = undefined;
		if (contextAware.length) {
			let ctx = activeFileUri
				? findContext(contextAware, { uri: activeFileUri })
				: undefined;
			ctx ??= contextAware[0];
			console.log(
				'Active context was deleted. Forcing active to',
				ctx.id,
			);
			await updateActiveContext({ id: ctx.id }, true);
		}
	}

	if (!context.settings.disableFileWatchers) {
		context.getContextFiles().map((file) => {
			fileWatchers.get(file)?.unwatch();
		});
	}

	setTimeout(async () => {
		await allStable();
		const usedFiles = new Set(
			contextAware.flatMap((c) => c.getContextFiles()),
		);
		context.getContextFiles().map((file) => {
			if (!usedFiles.has(file)) {
				getTokenizedDocumentProvider().reset(file);
			}
		});
	}, 2000); // allow for new context to be requested to preserve needed caches

	context.bindingLoader?.dispose();
};

const isStable = (context: ContextAware) => {
	const d = debounce.get(context);
	if (d?.abort.signal.aborted) return;
	return Promise.all([d?.promise, context.getRuntime()]);
};

const allStable = async () => {
	await Promise.all(contextAware.map(isStable));
};

const isAdHocContext = async (context: ContextAware) =>
	(await getAdhocContexts()).indexOf(context) !== -1;

const getAdhocContexts = async () => {
	const configuredContexts = await getConfiguredContexts();
	return contextAware.filter(
		(c) => !configuredContexts.some((cc) => cc === c),
	);
};

const getConfiguredContexts = async () => {
	const settings = await getResolvedPersistentContextSettings();
	return contextAware.filter((c) =>
		settings.contexts.find((sc) => generateContextId(sc) === c.id),
	);
};

const getUserSettingsContexts = async () => {
	const settings = await getResolvedUserContextSettings();
	return contextAware.filter((c) =>
		settings.contexts.find((sc) => generateContextId(sc) === c.id),
	);
};

const isUserSettingsContext = async (context: ContextAware) =>
	(await getUserSettingsContexts()).indexOf(context) !== -1;

const contextFullyOverlaps = async (a: ContextAware, b: ContextAware) => {
	if (a === b) {
		return true;
	}

	const contextAIncludes = (await a.getAllStableParsers())
		.flatMap((p) => p.cPreprocessorParser.dtsIncludes)
		.filter((i) => i.resolvedPath);
	const contextBIncludes = (await b.getAllStableParsers())
		.flatMap((p) => p.cPreprocessorParser.dtsIncludes)
		.filter((i) => i.resolvedPath);

	return contextBIncludes.some((i) =>
		isPathEqual(i.resolvedPath, a.parser.uri),
	) && contextAIncludes.length
		? contextAIncludes.every((f) =>
				contextBIncludes.some(
					(ff) =>
						ff.resolvedPath === f.resolvedPath &&
						ff.firstToken.pos.col === f.firstToken.pos.col &&
						ff.firstToken.pos.len === f.firstToken.pos.len &&
						ff.firstToken.pos.line === f.firstToken.pos.line &&
						ff.lastToken.pos.col === f.lastToken.pos.col &&
						ff.lastToken.pos.len === f.lastToken.pos.len &&
						ff.lastToken.pos.line === f.lastToken.pos.line,
				),
			)
		: b.getContextFiles().some((ff) => isPathEqual(ff, a.parser.uri));
};

const cleanUpAdHocContext = async (context: ContextAware) => {
	// NOTE For these context Overlays are not an to be considered as there is no way
	// for an adHocContext to be created with overlays
	if (!(await isAdHocContext(context))) return;

	const adhocContexts = await getAdhocContexts();
	const configContexts = await getConfiguredContexts();
	const adhocContextFiles = await resolveContextFiles(adhocContexts);

	if (contextAware.indexOf(context) === -1) {
		return;
	}

	const sameChart = await Promise.all(
		adhocContextFiles.flatMap((ac) => {
			return [
				...configContexts,
				...adhocContexts.filter((a) => a !== ac.context),
			].map(async (cc) => ({
				context: ac.context,
				same: await contextFullyOverlaps(ac.context, cc),
			}));
		}),
	);

	const contextFiles = context.getContextFiles();
	const contextToClean = adhocContextFiles
		.filter(
			(o) =>
				sameChart.some((r) => r.context === o.context && r.same) ||
				(o.context !== context &&
					isPathEqual(o.context.parser.uri, context.parser.uri) &&
					contextFiles.some((f) => f && o.files.indexOf(f) !== -1)),
		)
		.map((o) => o.context);

	if (contextToClean.length) {
		await Promise.all(contextToClean.map(deleteContext));
	}
};

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRefreshCapability = false;
let hasSemanticTokensRefreshCapability = false;
let hasFoldingRangesRefreshCapability = false;

let workspaceFolders: WorkspaceFolder[] | null | undefined;
connection.onInitialize(async (params: InitializeParams) => {
	// The workspace folder this server is operating on
	workspaceFolders = params.workspaceFolders ?? [];
	connection.console.log(
		`[Server(${process.pid}) ${
			workspaceFolders?.at(0)?.uri
		} Version 0.8.0-beta1 ] Started and initialize received`,
	);

	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRefreshCapability =
		!!capabilities.workspace?.diagnostics?.refreshSupport;

	hasSemanticTokensRefreshCapability =
		!!capabilities.workspace?.semanticTokens?.refreshSupport;

	hasFoldingRangesRefreshCapability =
		!!capabilities.workspace?.foldingRange?.refreshSupport;

	const result: InitializeResult = {
		capabilities: {
			typeDefinitionProvider: true,
			workspaceSymbolProvider: true,
			textDocumentSync: TextDocumentSyncKind.Incremental,
			renameProvider: {
				prepareProvider: true,
			},
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: ['&', '=', ' ', '"', '(', ','],
			},
			codeActionProvider: {
				codeActionKinds: [
					CodeActionKind.QuickFix,
					CodeActionKind.SourceFixAll,
				],
			},
			documentSymbolProvider: true,
			semanticTokensProvider: {
				legend: {
					tokenTypes: tokenTypes as unknown as string[],
					tokenModifiers: tokenModifiers as unknown as string[],
				},
				full: true,
			},
			documentLinkProvider: {
				resolveProvider: false,
			},
			foldingRangeProvider: true,
			definitionProvider: true,
			declarationProvider: true,
			referencesProvider: true,
			documentFormattingProvider: true,
			documentRangeFormattingProvider: true,
			hoverProvider: true,
			signatureHelpProvider: {
				triggerCharacters: ['<', '('],
				retriggerCharacters: [' ', ','],
			},
		},
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				changeNotifications: true,
				supported: true,
			},
		};
	}

	await updateSetting(params.initializationOptions);
	return result;
});

let lspClientEditorSettings: FormattingOptions | undefined;
let defaultEditorSettings: FormattingOptions = {
	tabSize: 8,
	insertSpaces: false,
	trimTrailingWhitespace: true,
	insertFinalNewline: true,
	wordWrapColumn: 100,
};

connection.onInitialized(async () => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, {});

		if (!lspClientEditorSettings) {
			const editorSettings = await connection.workspace
				.getConfiguration('editor')
				.catch(() => undefined);
			const dtsSettingsRaw = await connection.workspace
				.getConfiguration('[devicetree]')
				.catch(() => undefined);
			const dtsSettings = {
				tabSize: dtsSettingsRaw?.['editor.tabSize'],
				insertSpaces: dtsSettingsRaw?.['editor.insertSpaces'],
				trimFinalNewlines: dtsSettingsRaw?.['editor.trimFinalNewlines'],
				trimTrailingWhitespace:
					dtsSettingsRaw?.['editor.trimTrailingWhitespace'],
				insertFinalNewline:
					dtsSettingsRaw?.['editor.insertFinalNewline'],
				wordWrapColumn: dtsSettingsRaw?.['editor.wordWrapColumn'],
			};
			if (editorSettings || dtsSettings) {
				lspClientEditorSettings = {
					...editorSettings,
					...dtsSettings,
				};
			}
		}
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(async (_event) => {
			connection.console.log('Workspace folder change event received');
			await loadSettings();
		});
	}
});

connection.onRequest(
	'workspace/workspaceFolders',
	async (): Promise<WorkspaceFolder[] | null> => {
		return workspaceFolders ?? null;
	},
);

const getResolvedAdhocContextSettings = async () => {
	let unresolvedSettings = getUnresolvedAdhocContextSettings();

	unresolvedSettings = <Settings>{
		...defaultSettings,
		...unresolvedSettings,
	};

	return resolveSettings(unresolvedSettings, await getWorkspaces());
};

const getResolvedPersistentContextSettings = async () => {
	let unresolvedSettings = getUnresolvedPersistentContextSettings();

	unresolvedSettings = <Settings>{
		...defaultSettings,
		...unresolvedSettings,
	};

	return resolveSettings(unresolvedSettings, await getWorkspaces());
};

const getResolvedUserContextSettings = async () => {
	let unresolvedSettings = getUnresolvedUserContextSettings();

	unresolvedSettings = <Settings>{
		...defaultSettings,
		...unresolvedSettings,
	};

	return resolveSettings(unresolvedSettings, await getWorkspaces());
};

const getResolvedAllContextSettings = async () => {
	let unresolvedSettings = getUnresolvedAllContextSettings();

	unresolvedSettings = <Settings>{
		...defaultSettings,
		...unresolvedSettings,
	};

	return resolveSettings(unresolvedSettings, await getWorkspaces());
};

const getWorkspaces = async () => {
	if (hasWorkspaceFolderCapability) {
		return (await connection.workspace.getWorkspaceFolders()) ?? [];
	} else {
		return [];
	}
};

const createContext = async (context: ResolvedContext) => {
	const existingCtx = findContext(contextAware, {
		id: generateContextId(context),
	});

	if (existingCtx) {
		if (!existingCtx.ctxNames.includes(context.ctxName))
			console.log(
				`(ID: ${existingCtx.id}) Adding name ${
					context.ctxName
				} for [${existingCtx.ctxNames.join(',')}]`,
			);
		existingCtx.addCtxName(context.ctxName);
		return existingCtx;
	}

	const id = generateContextId(context);
	console.log(`(ID: ${id}) New context [${context.ctxName}]`);
	console.log(
		`(ID: ${id}) Settings: ${JSON.stringify(context, undefined, '\t')}`,
	);

	const zephyrBoardBindingPath = join(
		dirname(context.dtsFile),
		'dts',
		'bindings',
	);
	const newContext = new ContextAware(
		context,
		lspClientEditorSettings ?? defaultEditorSettings,
		context.bindingType
			? getBindingLoader(
					{
						zephyrBindings: context.zephyrBindings
							? [
									zephyrBoardBindingPath,
									...context.zephyrBindings,
								]
							: [zephyrBoardBindingPath],
						deviceOrgBindingsMetaSchema:
							context.deviceOrgBindingsMetaSchema ?? [],
						deviceOrgTreeBindings:
							context.deviceOrgTreeBindings ?? [],
					},
					context.bindingType,
				)
			: undefined,
	);

	contextAware.push(newContext);
	const t = performance.now();
	await newContext.stable();
	console.log(
		`(ID: ${id}) New context took ${performance.now() - t}ms to start [${context.ctxName}]`,
	);
	watchContextFiles(newContext);
	const meta = await contextMeta(newContext);

	connection.sendNotification('devicetree/contextCreated', {
		ctxNames: newContext.ctxNames.map((c) => c.toString()),
		id: newContext.id,
		...(await newContext.getFileTree()),
		settings: newContext.settings,
		active: newContext === activeContext,
		type: meta.type,
	} satisfies ContextListItem);

	await cleanUpAdHocContext(newContext);
	await reportContextList();
	return newContext;
};

const loadSettings = async () => {
	const resolvedPersistentSettings =
		await getResolvedPersistentContextSettings();
	let resolvedFullSettings = await getResolvedAllContextSettings();
	if (!resolvedFullSettings.allowAdhocContexts) {
		resolvedFullSettings = await getResolvedPersistentContextSettings();
	}

	const allActiveIds = resolvedFullSettings.contexts.map(generateContextId);
	const toDelete = contextAware.filter((c) => !allActiveIds.includes(c.id));
	await Promise.all(toDelete.map(deleteContext));

	await resolvedPersistentSettings.contexts?.reduce((p, c) => {
		return p.then(async () => {
			await createContext(c);
		});
	}, Promise.resolve());

	if (resolvedFullSettings.allowAdhocContexts) {
		const resolvedAdHocSettings = await getResolvedAdhocContextSettings();
		await resolvedAdHocSettings.contexts?.reduce((p, c) => {
			return p.then(async () => {
				if (findContext(contextAware, { uri: c.dtsFile })) {
					return; // Skip creating this adhoc context their is a persistence context covering this URI
				}
				await createContext(c);
			});
		}, Promise.resolve());
	}

	if (activeFileUri) {
		await updateActiveContext({ uri: activeFileUri });
	} else if (!activeContext && contextAware.length) {
		console.log(
			`No active context using first context (ID: ${
				contextAware[0].id
			}) [${contextAware[0].ctxNames.join(',')}]`,
		);
		await updateActiveContext({ id: contextAware[0].id });
	}
};

let lspConfigurationSettings: Settings | undefined;
let integrationSettings: Settings | undefined;
const adHocContextSettings = new Map<string, Context>();
const integrationContext = new Map<string, Context>();

const getUnresolvedAllContextSettings = (): Settings | undefined => {
	if (!integrationSettings && !lspConfigurationSettings) return;

	const merged = <Settings>{
		...integrationSettings,
		...lspConfigurationSettings,
		contexts: [
			...(lspConfigurationSettings?.contexts ?? []),
			...Array.from(integrationContext.values()),
			...Array.from(adHocContextSettings.values()), // last so if ctx exists we can reuse
		],
	};

	return merged;
};

const getUnresolvedAdhocContextSettings = (): Settings | undefined => {
	if (!integrationSettings && !lspConfigurationSettings) return;

	const merged = <Settings>{
		...integrationSettings,
		...lspConfigurationSettings,
		contexts: [...Array.from(adHocContextSettings.values())],
	};

	return merged;
};

const getUnresolvedPersistentContextSettings = (): Settings | undefined => {
	if (!integrationSettings && !lspConfigurationSettings) return;

	const merged = <Settings>{
		...integrationSettings,
		...lspConfigurationSettings,
		contexts: [
			...(lspConfigurationSettings?.contexts ?? []),
			...Array.from(integrationContext.values()),
		],
	};

	return merged;
};

const getUnresolvedUserContextSettings = (): Settings | undefined => {
	if (!integrationSettings && !lspConfigurationSettings) return;

	const merged = <Settings>{
		...lspConfigurationSettings,
		contexts: [...(lspConfigurationSettings?.contexts ?? [])],
	};

	return merged;
};

function deleteTopLevelNulls<T extends Record<string, any>>(
	obj: T,
): Partial<T> {
	const result: Partial<T> = { ...obj };

	for (const key in result) {
		if (result[key] === null) {
			delete result[key];
		}
	}

	return result;
}

const onSettingsChanged = async () => {
	const newSettings = await getResolvedAllContextSettings();
	console.log(
		'Resolved settings',
		JSON.stringify(newSettings, undefined, '\t'),
	);
	connection.sendNotification('devicetree/settingsChanged', newSettings);

	await loadSettings();
	allStable().then(() => {
		if (hasDiagnosticRefreshCapability) {
			connection.languages.diagnostics.refresh();
		}
	});
};

const reportNoContextFiles = async () => {
	const activeCtxFiles = activeContext?.getContextFiles();
	await Promise.all(
		Array.from(documents.keys())
			.filter(isDtsFile)
			.map(async (u) => {
				if (
					!activeCtxFiles?.some((p) =>
						isPathEqual(p, fileURLToPath(u)),
					)
				) {
					await connection.sendDiagnostics({
						uri: u,
						version: documents.get(u)?.version,
						diagnostics: [
							{
								severity: DiagnosticSeverity.Information,
								range: Range.create(
									Position.create(0, 0),
									Position.create(0, 0),
								),
								message: 'File not in active context',
								source: 'devicetree',
							},
						],
					});
				}
			}),
	);
};

const onChange = async (uri: string) => {
	const contexts = findContexts(contextAware, uri);

	if (!contexts.length) {
		const resolvedSettings = await getResolvedAllContextSettings();
		if (resolvedSettings.allowAdhocContexts === false) {
			return;
		}

		await loadSettings();
		await updateActiveContext({ uri });
	} else {
		contexts
			.sort((a, b) =>
				a === activeContext ? -1 : b === activeContext ? 1 : 0,
			)
			.forEach((context) => {
				debounce.get(context)?.abort.abort();
				const abort = new AbortController();
				const promise = new Promise<void>((resolve) => {
					setTimeout(async () => {
						context.setStaleUri(uri);

						if (abort.signal.aborted) {
							resolve();
							return;
						}
						const t = performance.now();
						const isActive = activeContext === context;
						const itemsToClear = isActive
							? generateClearWorkspaceDiagnostics(context)
							: [];
						const prevFiles = context.getContextFiles();
						await context.reevaluate(uri);
						watchContextFiles(context);
						prevFiles.forEach((f) =>
							fileWatchers.get(f)?.unwatch(),
						);

						if (isActive && getContextOpenFiles(context)?.length) {
							generateWorkspaceDiagnostics(context).then((d) => {
								const newDiagnostics = d.items.map(
									(i) =>
										({
											uri: i.uri,
											version: i.version ?? undefined,
											diagnostics: i.items,
										}) satisfies PublishDiagnosticsParams,
								);
								clearWorkspaceDiagnostics(
									context,
									itemsToClear.filter((i) =>
										newDiagnostics.every(
											(nd) => nd.uri !== i.uri,
										),
									),
								);
								newDiagnostics.forEach((ii) => {
									connection.sendDiagnostics(ii);
								});

								hasWorkspaceDiagnostics.set(context, true);
							});
						}

						const [meta, fileTree] = await Promise.all([
							contextMeta(context),
							context.getFileTree(),
						]);

						const ctx = {
							ctxNames: context.ctxNames.map((c) => c.toString()),
							id: context.id,
							...fileTree,
							settings: context.settings,
							active: isActive,
							type: meta.type,
						} satisfies ContextListItem;

						if (activeContext === context) {
							connection.sendNotification(
								'devicetree/activeContextStableNotification',
								ctx,
							);
						}

						connection.sendNotification(
							'devicetree/contextStableNotification',
							ctx,
						);

						resolve();
						console.log('reevaluate', performance.now() - t);
					}, 50);
				});

				debounce.set(context, { abort, promise });
			});
	}
};

const fetchDocumentUri = (file: string) => {
	return documents.keys().find((f) => isPathEqual(fileURLToPath(f), file));
};

const fetchDocument = (file: string) => {
	const uri = fetchDocumentUri(file);
	if (!uri) return;

	return documents.get(uri);
};

const generateClearWorkspaceDiagnostics = (context: ContextAware) =>
	context.getContextFiles().map(
		(file) =>
			({
				uri: pathToFileURL(file),
				version: fetchDocument(file)?.version,
				diagnostics: [],
			}) satisfies PublishDiagnosticsParams,
	);

const hasWorkspaceDiagnostics = new WeakMap<ContextAware, boolean>();

const clearWorkspaceDiagnostics = async (
	context: ContextAware,
	items: PublishDiagnosticsParams[] = generateClearWorkspaceDiagnostics(
		context,
	),
	force = false,
) => {
	if (!force && context !== activeContext) {
		return;
	}
	const t = performance.now();
	await Promise.all(
		items
			.filter(
				(item) =>
					context === activeContext ||
					!activeContext
						?.getContextFiles()
						.some((f) => isPathEqual(fileURLToPath(item.uri), f)),
			)
			.map((item) => {
				return connection.sendDiagnostics({
					uri: item.uri,
					version: documents.get(item.uri)?.version,
					diagnostics: [],
				} satisfies PublishDiagnosticsParams);
			}),
	);

	hasWorkspaceDiagnostics.delete(context);

	console.log(
		`(ID: ${context.id})`,
		'clear workspace diagnostics',
		`[${context.ctxNames.join(',')}]`,
		performance.now() - t,
	);
};

const generateWorkspaceDiagnostics = async (context: ContextAware) => {
	await context.stable();
	const t = performance.now();
	const diagnostics = await context.getDiagnostics();
	const activeContextItems = await Promise.all(
		context.getContextFiles().map(async (file) => {
			const textDocument = fetchDocument(file);
			const formattingItems: Diagnostic[] = [];
			if (
				textDocument &&
				context.settings.showFormattingErrorAsDiagnostics
			) {
				formattingItems.push(
					...(
						await formatText(
							{
								textDocument,
								options: context.formattingOptions,
							},
							textDocument?.getText(),
							'File Diagnostics',
						).catch(() => [])
					).map((d) => d.diagnostic()),
				);
			}

			return {
				uri: pathToFileURL(file),
				kind: DocumentDiagnosticReportKind.Full,
				items: [...(diagnostics.get(file) ?? []), ...formattingItems],
				version: textDocument?.version ?? null,
			} satisfies WorkspaceDocumentDiagnosticReport;
		}),
	);

	console.log(
		`(ID: ${context.id})`,
		'workspace diagnostics',
		`[${context.ctxNames.join(',')}]`,
		performance.now() - t,
	);
	return {
		items: [...activeContextItems],
	};
};

const sendContextDiagnostics = async (context: ContextAware) => {
	const { items } = await generateWorkspaceDiagnostics(context);
	items
		.map(
			(i) =>
				({
					uri: i.uri,
					version: i.version ?? undefined,
					diagnostics: i.items,
				}) satisfies PublishDiagnosticsParams,
		)
		.forEach(async (ii) => {
			connection.sendDiagnostics(ii);
		});

	hasWorkspaceDiagnostics.set(context, true);
};

const reportContextList = async () => {
	const forLogs = await Promise.all(contextAware.map(contextMeta));

	console.log('======== Context List ========');
	forLogs.forEach((c) => {
		console.log(
			`(ID: ${c.ctx.id}) [${c.ctx.ctxNames.join(',')}]`,
			`[${c.type}]`,
			activeContext === c.ctx ? ' [ACTIVE]' : '',
		);
	});
	console.log('==============================');
};

const contextMeta = async (ctx: ContextAware) => {
	const adHoc = await isAdHocContext(ctx);
	const userCtx = !adHoc && (await isUserSettingsContext(ctx));
	return {
		ctx,
		type: (adHoc
			? 'Ad Hoc'
			: userCtx
				? 'User'
				: '3rd Party') as ContextType,
	};
};

const updateActiveContext = async (id: ContextId, force = false) => {
	if ('uri' in id) {
		if (!isDtsFile(id.uri)) {
			return false;
		}
		activeFileUri = id.uri;
		console.log('Active File Uri', activeFileUri);
	}

	const resolvedSettings = await getResolvedAllContextSettings();

	if (activeContext && !force && !resolvedSettings.autoChangeContext) {
		return false;
	}

	await allStable();

	if (
		!force &&
		activeContext
			?.getContextFiles()
			.find((f) => 'uri' in id && isPathEqual(f, id.uri))
	)
		return false;

	const oldContext = activeContext;
	const newContext = findContext(contextAware, id);

	const updateActiveContext = oldContext !== newContext;

	if (updateActiveContext) {
		if (oldContext) {
			clearWorkspaceDiagnostics(oldContext);
		}
		activeContext = newContext;

		if (newContext) {
			contextMeta(newContext).then(async (meta) => {
				const fileTree = await newContext.getFileTree();
				if (
					!newContext ||
					(newContext !== activeContext &&
						!contextAware.includes(newContext))
				)
					return;

				connection.sendNotification('devicetree/newActiveContext', {
					ctxNames: newContext.ctxNames.map((c) => c.toString()),
					id: newContext.id,
					...fileTree,
					settings: newContext.settings,
					active: activeContext === newContext,
					type: meta.type,
				} satisfies ContextListItem);
			});

			if (getContextOpenFiles(newContext)?.length) {
				sendContextDiagnostics(newContext);
			}
			await reportContextList();
		} else {
			connection.sendNotification(
				'devicetree/newActiveContext',
				undefined,
			);
		}
	}

	if (hasFoldingRangesRefreshCapability) {
		connection.languages.foldingRange.refresh();
	}
	if (hasSemanticTokensRefreshCapability) {
		connection.languages.semanticTokens.refresh();
	}

	return updateActiveContext;
};

const isDtsFile = (uri: string) =>
	['.dts', '.dtsi', '.dtso', '.overlay'].some((ext) => uri.endsWith(ext));

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

const getContextOpenFiles = (context: ContextAware | undefined) => {
	return context?.getContextFiles()?.filter((f) => fetchDocument(f));
};

documents.onDidSave((e) => {
	lastSavedFileVersion.set(fileURLToPath(e.document.uri), e.document.version);
});

// Only keep settings for open documents
documents.onDidClose(async (e) => {
	const uri = fileURLToPath(e.document.uri);

	if (!isDtsFile(uri)) {
		return;
	}

	lastSavedFileVersion.delete(uri);

	const contexts = findContexts(contextAware, uri);
	if (contexts.length === 0) {
		adHocContextSettings.delete(uri);
		connection.sendDiagnostics({
			uri: e.document.uri,
			version: documents.get(e.document.uri)?.version,
			diagnostics: [],
		});
		return;
	}

	await Promise.all(
		contexts.map(async (context) => {
			const contextHasFileOpen = !!getContextOpenFiles(context)?.filter(
				(f) => f !== uri,
			).length;

			if (!contextHasFileOpen) {
				if (await isAdHocContext(context)) {
					await deleteContext(context);
					adHocContextSettings.delete(context.settings.dtsFile);
				} else {
					clearWorkspaceDiagnostics(context);
				}
			} else {
				if (
					!activeContext
						?.getContextFiles()
						.some((f) => isPathEqual(f, uri))
				) {
					connection.sendDiagnostics({
						uri: e.document.uri,
						version: documents.get(e.document.uri)?.version,
						diagnostics: [],
					} satisfies PublishDiagnosticsParams);
				} else if (
					activeContext
						?.getContextFiles()
						.some((f) => isPathEqual(f, uri))
				) {
					await clearWorkspaceDiagnostics(activeContext);
					await sendContextDiagnostics(activeContext);
				}
			}
		}),
	);
});

documents.onDidOpen(async (e) => {
	const uri = fileURLToPath(e.document.uri);
	if (!isDtsFile(uri)) {
		return;
	}

	lastSavedFileVersion.set(uri, e.document.version);

	await allStable();
	reportNoContextFiles();

	const ctx = findContext(contextAware, { uri });
	console.log('onDidOpen', ctx?.id, uri);
	if (!ctx) {
		const contextBaseSettings: Context = {
			ctxName: basename(uri),
			dtsFile: uri,
		};

		adHocContextSettings.set(uri, contextBaseSettings);
		await onChange(uri);
	} else if (ctx !== activeContext) {
		await updateActiveContext({ id: ctx.id });
	} else if (
		ctx === activeContext &&
		(!hasWorkspaceDiagnostics.get(ctx) ||
			ctx.getContextFiles().some((f) => !isPathEqual(f, uri)))
	) {
		await sendContextDiagnostics(ctx);
	}
});

documents.onDidChangeContent(async (change) => {
	const fsPath = fileURLToPath(change.document.uri);

	if (!isDtsFile(fsPath)) {
		return;
	}

	const text = change.document.getText();
	const tokenProvider = getTokenizedDocumentProvider();
	if (!tokenProvider.needsRenew(fsPath, text)) return;

	console.log('Content changed', fsPath);
	tokenProvider.renewLexer(fsPath, text);
	await onChange(fsPath);
});

const updateSetting = async (config: any) => {
	if (!config?.settings?.devicetree) {
		return;
	}

	lspConfigurationSettings = fixSettingsTypes(
		deleteTopLevelNulls(config.settings.devicetree) as Settings,
	);

	console.log(
		'Configuration changed',
		JSON.stringify(config, undefined, '\t'),
	);

	await onSettingsChanged();
};

connection.onDidChangeConfiguration(async (change) => {
	await updateSetting(change);
});

// Listen on the connection
connection.listen();

connection.languages.diagnostics.onWorkspace(async () => {
	await allStable();
	const context = activeContext;

	if (!context) {
		return {
			items: [],
		};
	}

	return generateWorkspaceDiagnostics(context).finally(() => {
		hasWorkspaceDiagnostics.set(context, true);
	});
});

connection.onDidChangeWatchedFiles((_change) => {
	connection.console.log('We received a file change event');
});

connection.onCompletion(
	async (
		textDocumentPosition: TextDocumentPositionParams,
	): Promise<CompletionItem[]> => {
		const filePath = fileURLToPath(textDocumentPosition.textDocument.uri);

		if (
			(filePath.endsWith('.c') || filePath.endsWith('.cpp')) &&
			activeContext &&
			activeContext.bindingLoader?.type === 'Zephyr'
		) {
			return getDtMacroCompletions(
				textDocumentPosition,
				activeContext,
				documents.get(textDocumentPosition.textDocument.uri),
			);
		}

		if (!isDtsFile(filePath)) {
			return [];
		}

		await allStable();

		updateActiveContext({ uri: filePath });
		const context = quickFindContext(filePath);

		if (context) {
			return [
				...(await getCompletions(textDocumentPosition, context)),
				...(await getTypeCompletions(textDocumentPosition, context)),
			];
		}

		return [];
	},
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	return item;
});

const quickFindContext = (uri: string) => {
	const settings = getUnresolvedAdhocContextSettings();
	return findContext(
		contextAware,
		{ uri },
		activeContext,
		settings?.preferredContext,
	);
};

connection.onDocumentSymbol(async (h) => {
	const uri = fileURLToPath(h.textDocument.uri);
	if (!isDtsFile(uri)) {
		return [];
	}

	await allStable();
	const context = quickFindContext(uri);

	if (!context) return [];
	return context.getUriParser(uri)?.getDocumentSymbols(uri);
});

connection.onWorkspaceSymbol(async () => {
	await allStable();
	const context = activeContext;
	if (!context) return [];

	return (await context.getAllStableParsers()).flatMap((p) =>
		p.getWorkspaceSymbols(),
	) satisfies WorkspaceSymbol[];
});

connection.languages.semanticTokens.on(async (h) => {
	const uri = fileURLToPath(h.textDocument.uri);
	if (!isDtsFile(uri)) {
		return { data: [] };
	}

	try {
		await allStable();

		const context = quickFindContext(uri);
		const tokensBuilder = new SemanticTokensBuilder();

		const isInContext = context?.isInContext(uri);
		if (!context || !isInContext) {
			return { data: [] };
		}

		(await context.getAllStableParsers()).forEach((parser) =>
			parser.buildSemanticTokens(tokensBuilder, uri),
		);

		return tokensBuilder.build();
	} catch (e) {
		console.log(e);
		throw e;
	}
});

connection.onDocumentLinks(async (event) => {
	await allStable();

	const uri = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(uri)) {
		if (uri.endsWith('.yaml') && activeContext) {
			return (
				activeContext.bindingLoader?.getDocumentLinks?.(
					documents.get(event.textDocument.uri),
				) ?? []
			);
		}

		return [];
	}

	const context = quickFindContext(uri);

	return context?.getDocumentLinks(uri);
});

connection.onPrepareRename(async (event) => {
	const uri = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(uri)) {
		return;
	}
	await allStable();
	updateActiveContext({ uri });
	const context = quickFindContext(uri);

	return getPrepareRenameRequest(event, context);
});

connection.onRenameRequest(async (event) => {
	const uri = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(uri)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri });
	const context = quickFindContext(uri);

	return getRenameRequest(event, context);
});

connection.onReferences(async (event) => {
	const uri = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(uri)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri });
	const context = quickFindContext(uri);

	return getReferences(event, context);
});

connection.onDefinition(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);

	if (
		(filePath.endsWith('.c') || filePath.endsWith('.cpp')) &&
		activeContext &&
		activeContext.bindingLoader?.type === 'Zephyr'
	) {
		return getDTMacroDefinitions(
			event,
			activeContext,
			documents.get(event.textDocument.uri),
		);
	}

	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri: filePath });
	const context = quickFindContext(filePath);

	const documentLinkDefinition =
		(await context?.getDocumentLinks(filePath, event.position))
			?.filter((docLink) => docLink.target)
			.map((docLink) =>
				Location.create(docLink.target!, docLink.range),
			) ?? [];

	if (documentLinkDefinition.length) return documentLinkDefinition;

	return getDefinitions(event, context);
});

connection.onDeclaration(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);

	if (
		(filePath.endsWith('.c') || filePath.endsWith('.cpp')) &&
		activeContext &&
		activeContext.bindingLoader?.type === 'Zephyr'
	) {
		return getDTMacroDeclaration(
			event,
			activeContext,
			documents.get(event.textDocument.uri),
		);
	}

	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri: filePath });
	const context = quickFindContext(filePath);

	return getDeclaration(event, context);
});

connection.onCodeAction(async (event) => {
	const uri = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(uri)) {
		return;
	}
	return getCodeActions(event);
});

const onDocumentFormat = async (
	event: DocumentFormattingParams | DocumentRangeFormattingParams,
) => {
	const filePath = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri: filePath });
	const context = quickFindContext(filePath);

	if (!context) {
		return [];
	}

	const issues = (
		await context.getSyntaxIssues(undefined, (issue) =>
			coreSyntaxIssuesFilter(issue.raw, filePath, false)
				? issue
				: undefined,
		)
	).get(filePath);

	if (issues?.length) {
		return [];
	}

	const document = getTokenizedDocumentProvider().getDocument(filePath);
	const text = document.getText();
	const newText = await formatText(event, text, 'New Text').catch(() => text);

	if (newText === text) {
		return [];
	}

	const lastLine = document.lineCount - 1;
	const lastLineLength = document.getText({
		start: { line: lastLine, character: 0 },
		end: { line: lastLine + 1, character: 0 },
	}).length;

	return [
		TextEdit.replace(
			Range.create(
				Position.create(0, 0),
				Position.create(document.lineCount, lastLineLength),
			),
			newText,
		),
	];
};

connection.onDocumentRangeFormatting(onDocumentFormat);

connection.onDocumentFormatting(onDocumentFormat);

connection.onHover(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);

	if (
		(filePath.endsWith('.c') || filePath.endsWith('.cpp')) &&
		activeContext &&
		activeContext.bindingLoader?.type === 'Zephyr'
	) {
		return getDTMacroHover(
			event,
			activeContext,
			documents.get(event.textDocument.uri),
		);
	}

	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();
	const context = quickFindContext(filePath);

	return (await getHover(event, context)).at(0);
});

connection.onFoldingRanges(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();

	const context = quickFindContext(filePath);

	const isInContext = context?.isInContext(filePath);
	if (!context || !isInContext) {
		return [];
	}

	const parser = (await context.getAllStableParsers()).find((p) =>
		p.getFiles().some((i) => i === filePath),
	);

	if (parser) return getFoldingRanges(filePath, parser);
	return [];
});

connection.onTypeDefinition(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();
	updateActiveContext({ uri: filePath });
	const context = quickFindContext(filePath);

	return typeDefinition(event, context);
});

connection.onSignatureHelp(async (event) => {
	const filePath = fileURLToPath(event.textDocument.uri);
	if (!isDtsFile(filePath)) {
		return;
	}

	await allStable();

	updateActiveContext({ uri: filePath });
	const context = quickFindContext(filePath);

	return getSignatureHelp(event, context);
});

// CUSTOM APIS
connection.onRequest(
	'devicetree/getContexts',
	async (): Promise<ContextListItem[]> => {
		await allStable();
		return Promise.all(
			contextAware.map(async (c) => {
				const meta = await contextMeta(c);
				return {
					ctxNames: c.ctxNames.map((n) => n.toString()),
					id: c.id,
					...(await c.getFileTree()),
					settings: c.settings,
					active: activeContext === c,
					type: meta.type,
				} satisfies ContextListItem;
			}),
		);
	},
);

connection.onRequest(
	'devicetree/setActive',
	async (id: ContextId): Promise<boolean> => {
		await allStable();
		console.log('devicetree/setActive', id);
		const result = await updateActiveContext(id, true);
		return result;
	},
);

connection.onRequest(
	'devicetree/getActiveContext',
	async (): Promise<ContextListItem | undefined> => {
		await allStable();
		console.log('devicetree/getActiveContext');
		if (!activeContext) return;

		const meta = await contextMeta(activeContext);
		return activeContext
			? {
					ctxNames: activeContext.ctxNames.map((c) => c.toString()),
					id: activeContext.id,
					...(await activeContext.getFileTree()),
					settings: activeContext.settings,
					active: true,
					type: meta.type,
				}
			: undefined;
	},
);

connection.onRequest(
	'devicetree/setDefaultSettings',
	async (setting: IntegrationSettings) => {
		await allStable();
		integrationSettings = setting;
		console.log('Integration Settings', setting);
		await onSettingsChanged();
	},
);

connection.onRequest(
	'devicetree/requestContext',
	async (ctx: Context): Promise<ContextListItem> => {
		await allStable();

		const resolvedSettings = await getResolvedAllContextSettings();
		const resolvedContext = await resolveContextSetting(
			ctx,
			resolvedSettings,
			await getWorkspaces(),
		);
		console.log('devicetree/requestContext', resolvedContext);
		const id = generateContextId(resolvedContext);
		const sameNameCtx = Array.from(integrationContext).find(
			([, ic]) => ic.ctxName === ctx.ctxName,
		);
		if (sameNameCtx) {
			const id = sameNameCtx[0].split(':', 1)[0];
			findContext(contextAware, {
				name: ctx.ctxName.toString(),
			})?.removeCtxName(ctx.ctxName);
			console.log(
				`Removing integration context with ID ${id} and name ${ctx.ctxName}`,
			);
			integrationContext.delete(sameNameCtx[0]);
		}
		integrationContext.set(`${id}:${ctx.ctxName}`, ctx);

		await loadSettings();

		const context = contextAware.find((c) => c.id === id);
		if (!context) {
			throw new Error('Failed to create context');
		}

		const meta = await contextMeta(context);
		return {
			ctxNames: context.ctxNames.map((c) => c.toString()),
			id: id,
			...(await context.getFileTree()),
			settings: context.settings,
			active: true,
			type: meta.type,
		};
	},
);

connection.onRequest(
	'devicetree/removeContext',
	async ({ id, name }: { id: string; name: string }) => {
		await allStable();

		integrationContext.delete(`${id}:${name}`);

		const context = findContext(contextAware, { id });
		if (!context) return;

		context.removeCtxName(name);

		if (context.ctxNames.length) {
			console.log(
				'Context will not be deleted as it is still in use by others',
			);
			return;
		}

		await loadSettings();
	},
);

connection.onRequest(
	'devicetree/compiledDtsOutput',
	async (id: string): Promise<string | undefined> => {
		await allStable();
		if (!id) {
			return;
		}
		const ctx = findContext(contextAware, { id });
		if (!ctx) {
			return;
		}
		const text = await ctx.toFullString();
		return formatText(
			{
				textDocument: { uri: pathToFileURL(ctx.settings.dtsFile) },
				options: ctx.formattingOptions,
			},
			text,
			'New Text',
		).catch(() => text);
	},
);

connection.onRequest(
	'devicetree/serializedContext',
	async (id: string): Promise<SerializedNode | undefined> => {
		await allStable();
		if (!id) {
			return;
		}
		const ctx = findContext(contextAware, { id });
		const t = performance.now();
		return ctx?.serialize().finally(() => {
			console.info('serializedContext', performance.now() - t);
		});
	},
);

connection.onRequest(
	'devicetree/activePath',
	async (
		location: TextDocumentPositionParams,
	): Promise<LocationResult | undefined> => {
		await allStable();

		if (!activeContext) {
			return;
		}

		const action = (
			locationMeta?: SearchableResult,
		): LocationResult | undefined => {
			if (!locationMeta?.item) {
				return;
			}

			if (locationMeta.item instanceof Node) {
				return { nodePath: locationMeta.item.pathString };
			}

			return {
				nodePath: locationMeta.item.parent.pathString,
				propertyName: locationMeta.item.name,
			};
		};

		return (
			await nodeFinder(location, activeContext, (locationMeta) => [
				action(locationMeta),
			])
		).at(0);
	},
);

connection.onRequest(
	'devicetree/customActions',
	async (location: TextDocumentPositionParams) => {
		await allStable();
		return getActions(location, activeContext);
	},
);

connection.onRequest('devicetree/activeFileUri', async (uri: string) => {
	await allStable();
	updateActiveContext({ uri });
});

connection.onRequest(
	'devicetree/formattingText',
	async (
		event: DocumentFormattingParams & {
			text?: string;
		},
	) => {
		const filePath = fileURLToPath(event.textDocument.uri);

		const documentText =
			fetchDocument(filePath) ??
			getTokenizedDocumentProvider().getDocument(filePath, event.text);
		const newText = await formatText(event, documentText.getText(), 'Both');

		return {
			text: newText.text,
			diagnostics: newText.diagnostic.map((d) => d.diagnostic()),
		};
	},
);

connection.onRequest(
	'devicetree/diagnosticIssues',
	async ({ uri, full }: { uri: string; full?: boolean }) => {
		await allStable();
		const filePath = fileURLToPath(uri);
		updateActiveContext({ uri: filePath });
		const context = quickFindContext(filePath);

		if (!context) {
			return [];
		}

		const issues = full
			? (await context.getDiagnostics()).get(filePath)
			: (
					await context.getSyntaxIssues(undefined, (issue) =>
						coreSyntaxIssuesFilter(issue.raw, filePath, !!full)
							? issue
							: undefined,
					)
				).get(filePath);

		if (!issues?.length) {
			return;
		}

		return issues;
	},
);

connection.onRequest(
	'devicetree/evalMacros',
	async ({ macros, ctxId }: { macros: string[]; ctxId: string }) => {
		await allStable();

		const context = findContext(contextAware, { id: ctxId });

		if (!context) {
			return [];
		}

		return macros.map<EvaluatedMacro>((macro) => {
			const expanded = expandMacros(macro, context.macros);
			const evaluated = evalExp(expanded);
			return {
				macro,
				evaluated: typeof evaluated === 'number' ? evaluated : expanded,
			};
		});
	},
);
