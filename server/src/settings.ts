/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import path, { basename, resolve } from 'path';
import { existsSync } from 'fs';
import { WorkspaceFolder } from 'vscode-languageserver-types';
import {
	Context,
	PartialBy,
	ResolvedContext,
	ResolvedSettings,
	Settings,
} from './types/index';
import { fileURIToFsPath, isSubPath, normalizePath } from './helpers';

const fixToArray = <T>(a: T): T | undefined => {
	if (!a) return;
	return Array.isArray(a) ? a : ([a] as T);
};

const fixContextSettings = (context: Context): Context => {
	return {
		...context,
		deviceOrgBindingsMetaSchema: fixToArray(
			context.deviceOrgBindingsMetaSchema,
		),
		deviceOrgTreeBindings: fixToArray(context.deviceOrgTreeBindings),
		includePaths: fixToArray(context.includePaths),
		lockRenameEdits: fixToArray(context.lockRenameEdits),
		zephyrBindings: fixToArray(context.zephyrBindings),
		overlays: fixToArray(context.overlays),
	};
};

export const fixSettingsTypes = (settings: Settings): Settings => {
	return {
		...settings,
		defaultDeviceOrgBindingsMetaSchema: fixToArray(
			settings.defaultDeviceOrgBindingsMetaSchema,
		),
		defaultDeviceOrgTreeBindings: fixToArray(
			settings.defaultDeviceOrgTreeBindings,
		),
		defaultIncludePaths: fixToArray(settings.defaultIncludePaths),
		defaultLockRenameEdits: fixToArray(settings.defaultLockRenameEdits),
		defaultZephyrBindings: fixToArray(settings.defaultZephyrBindings),
		contexts: (settings.contexts as Context[] | undefined)?.map(
			fixContextSettings,
		) as ResolvedContext[] | undefined,
	};
};

const resolvePathVariable = async (
	path: string,
	workspaceFolders: WorkspaceFolder[] = [],
	boardfile?: string,
): Promise<string> => {
	const boardWorkspace = boardfile
		? workspaceFolders
				.map((w) => fileURIToFsPath(w.uri))
				.find((workspace) => isSubPath(workspace, boardfile))
		: undefined;

	const stringToReplace = [
		...(workspaceFolders.at(0)
			? [
					{
						replace: '${workspaceFolder}',
						fsPath:
							boardWorkspace ??
							fileURIToFsPath(workspaceFolders[0].uri),
					},
				]
			: []),
		...workspaceFolders.map((folder) => ({
			replace: `\${workspaceFolder:${folder.name}}`,
			fsPath: fileURIToFsPath(folder.uri),
		})),
	];

	stringToReplace.forEach(
		(r) => (path = path.replaceAll(r.replace, r.fsPath)),
	);

	return path;
};

export const defaultSettings: ResolvedSettings = {
	defaultBindingType: 'Zephyr',
	defaultZephyrBindings: [],
	defaultIncludePaths: [],
	defaultDeviceOrgBindingsMetaSchema: [],
	defaultDeviceOrgTreeBindings: [],
	contexts: [],
	defaultLockRenameEdits: [],
	allowAdhocContexts: true,
	autoChangeContext: true,
	defaultShowFormattingErrorAsDiagnostics: true,
	disableFileWatchers: false,
};

export const resolveContextSetting = async (
	context: Context,
	defaultSettings: PartialBy<ResolvedSettings, 'contexts'>,
	workspaceFolders: WorkspaceFolder[],
): Promise<ResolvedContext> => {
	const cwd =
		(await resolvePathVariable(
			context.cwd ?? '${workspaceFolder}',
			workspaceFolders,
			context.dtsFile,
		)) ?? defaultSettings.cwd;
	let includePaths = await Promise.all(
		(context.includePaths ?? defaultSettings.defaultIncludePaths).map((v) =>
			resolvePathVariable(v, workspaceFolders, context.dtsFile),
		),
	);
	let zephyrBindings = await Promise.all(
		(context.zephyrBindings ?? defaultSettings.defaultZephyrBindings).map(
			(v) => resolvePathVariable(v, workspaceFolders, context.dtsFile),
		),
	);
	const bindingType =
		context.bindingType ?? defaultSettings.defaultBindingType;
	let deviceOrgTreeBindings = await Promise.all(
		(
			context.deviceOrgTreeBindings ??
			defaultSettings.defaultDeviceOrgTreeBindings
		).map((v) => resolvePathVariable(v, workspaceFolders, context.dtsFile)),
	);
	let deviceOrgBindingsMetaSchema = await Promise.all(
		(
			context.deviceOrgBindingsMetaSchema ??
			defaultSettings.defaultDeviceOrgBindingsMetaSchema
		).map((v) => resolvePathVariable(v, workspaceFolders, context.dtsFile)),
	);
	let lockRenameEdits = await Promise.all(
		(context.lockRenameEdits ?? defaultSettings.defaultLockRenameEdits).map(
			(v) => resolvePathVariable(v, workspaceFolders, context.dtsFile),
		),
	);

	if (
		cwd &&
		bindingType === 'Zephyr' &&
		(!zephyrBindings || zephyrBindings.length === 0)
	) {
		zephyrBindings = ['./zephyr/dts/bindings'];
	}

	let dtsFile = context.dtsFile;
	let overlays = context.overlays ?? [];
	let compileCommands = context.compileCommands;

	if (cwd) {
		zephyrBindings = zephyrBindings
			.map((i) => resolve(cwd, i))
			.filter((p) => existsSync(p));
		deviceOrgTreeBindings = deviceOrgTreeBindings?.map((i) =>
			resolve(cwd, i),
		);
		deviceOrgBindingsMetaSchema = deviceOrgBindingsMetaSchema.map((i) =>
			resolve(cwd, i),
		);
		includePaths = includePaths.map((i) => resolve(cwd, i));
		dtsFile = resolve(cwd, dtsFile);
		overlays = overlays.map((overlay) => resolve(cwd, overlay));
		lockRenameEdits = lockRenameEdits.map((lockRenameEdit) =>
			resolve(cwd, lockRenameEdit),
		);
		compileCommands = compileCommands
			? resolve(cwd, compileCommands)
			: undefined;
	}

	return {
		ctxName: context.ctxName ?? basename(dtsFile),
		cwd: cwd ? normalizePath(cwd) : undefined,
		includePaths: includePaths.map(normalizePath),
		zephyrBindings: zephyrBindings.map(normalizePath),
		bindingType,
		deviceOrgTreeBindings: deviceOrgTreeBindings.map(normalizePath),
		deviceOrgBindingsMetaSchema:
			deviceOrgBindingsMetaSchema.map(normalizePath),
		dtsFile: normalizePath(dtsFile),
		overlays: overlays.map(normalizePath),
		lockRenameEdits: lockRenameEdits.map(normalizePath),
		compileCommands: compileCommands
			? normalizePath(compileCommands)
			: undefined,
		showFormattingErrorAsDiagnostics:
			context.showFormattingErrorAsDiagnostics ??
			defaultSettings.defaultShowFormattingErrorAsDiagnostics,
		disableFileWatchers:
			context.disableFileWatchers ?? defaultSettings.disableFileWatchers,
	};
};

export const resolveSettings = async (
	globalSettings: Settings,
	workspaceFolders: WorkspaceFolder[],
): Promise<ResolvedSettings> => {
	const cwd = globalSettings.cwd
		? await resolvePathVariable(globalSettings.cwd, workspaceFolders)
		: undefined;

	const defaultBindingType = globalSettings.defaultBindingType;
	let defaultDeviceOrgBindingsMetaSchema =
		(globalSettings.defaultDeviceOrgBindingsMetaSchema = await Promise.all(
			(globalSettings.defaultDeviceOrgBindingsMetaSchema ?? []).map((v) =>
				resolvePathVariable(v, workspaceFolders),
			),
		));
	let defaultDeviceOrgTreeBindings =
		(globalSettings.defaultDeviceOrgTreeBindings = await Promise.all(
			(globalSettings.defaultDeviceOrgTreeBindings ?? []).map((v) =>
				resolvePathVariable(v, workspaceFolders),
			),
		));

	let defaultIncludePaths = (globalSettings.defaultIncludePaths =
		await Promise.all(
			(globalSettings.defaultIncludePaths ?? []).map((v) =>
				resolvePathVariable(v, workspaceFolders),
			),
		));
	let defaultZephyrBindings = (globalSettings.defaultZephyrBindings =
		await Promise.all(
			(globalSettings.defaultZephyrBindings ?? []).map((v) =>
				resolvePathVariable(v, workspaceFolders),
			),
		));
	let defaultLockRenameEdits = (globalSettings.defaultLockRenameEdits =
		await Promise.all(
			(globalSettings.defaultLockRenameEdits ?? []).map((v) =>
				resolvePathVariable(v, workspaceFolders),
			),
		));

	if (cwd) {
		// resolve global with cwd
		defaultIncludePaths = globalSettings.defaultIncludePaths = (
			globalSettings.defaultIncludePaths ?? []
		).map((i) => resolve(cwd, i));

		if (
			defaultBindingType === 'Zephyr' &&
			!globalSettings.defaultZephyrBindings
		) {
			defaultZephyrBindings = ['./zephyr/dts/bindings'];
		}

		defaultZephyrBindings = defaultZephyrBindings.map((i) =>
			resolve(cwd, i),
		);

		defaultDeviceOrgBindingsMetaSchema =
			defaultDeviceOrgBindingsMetaSchema.map((i) => resolve(cwd, i));

		defaultDeviceOrgTreeBindings = (
			globalSettings.defaultDeviceOrgTreeBindings ?? []
		).map((i) => resolve(cwd, i));

		defaultLockRenameEdits = defaultLockRenameEdits.map((i) =>
			resolve(cwd, i),
		);
	}

	const resolvedGlobalSettings: PartialBy<ResolvedSettings, 'contexts'> = {
		cwd,
		defaultDeviceOrgBindingsMetaSchema,
		defaultDeviceOrgTreeBindings,
		defaultIncludePaths,
		defaultZephyrBindings,
		defaultLockRenameEdits,
		defaultBindingType,
		autoChangeContext:
			globalSettings.autoChangeContext ??
			defaultSettings.autoChangeContext,
		allowAdhocContexts:
			globalSettings.allowAdhocContexts ??
			defaultSettings.allowAdhocContexts,
		defaultShowFormattingErrorAsDiagnostics:
			globalSettings.defaultShowFormattingErrorAsDiagnostics ??
			defaultSettings.defaultShowFormattingErrorAsDiagnostics,
		disableFileWatchers: globalSettings.disableFileWatchers ?? false,
	};

	const contexts = (
		await Promise.all(
			globalSettings.contexts?.map((ctx) =>
				resolveContextSetting(
					ctx,
					resolvedGlobalSettings,
					workspaceFolders,
				),
			) ?? [],
		)
	).filter((c) =>
		[c.dtsFile, ...c.overlays].every(
			(p) => existsSync(p) && path.isAbsolute(p),
		),
	);

	return {
		...resolvedGlobalSettings,
		contexts,
	};
};
