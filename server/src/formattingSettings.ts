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

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { FormattingSettings } from './formatting/types';
import { FormattingFlags } from './types/index';
import { fileURIToFsPath } from './helpers';

type FormattingFile = FormattingFlags & FormattingSettings;

interface LoadedFormattingFile {
	/** Directory containing the .dts-format file */
	directory: string;

	/** Full path to the .dts-format file */
	file: string;

	config: FormattingFile;
}

let loadedFormattingFilesCache: LoadedFormattingFile[] | null = null;
let workspacesCache: string[] | null = null;

export function getFileOverridFormattingSettings(
	fsPath: string,
	workspaces: string[] = [],
): FormattingFile | undefined {
	if (
		!workspacesCache ||
		!workspaces.every((workspace) => workspacesCache?.includes(workspace))
	) {
		loadedFormattingFilesCache = loadFormattingFiles(workspaces);
	}

	return findFormattingConfig(loadedFormattingFilesCache!, fsPath);
}

function loadFormattingFiles(workspaces: string[]): LoadedFormattingFile[] {
	workspaces = workspaces.map(fileURIToFsPath);
	const configs: LoadedFormattingFile[] = [];

	for (const workspace of workspaces) {
		for (const relative of glob.sync('**/.dts-format', {
			cwd: workspace,
		})) {
			const file = path.join(workspace, relative);

			try {
				const config = JSON.parse(
					fs.readFileSync(file, 'utf8'),
				) as FormattingFile;

				configs.push({
					file,
					directory: path.dirname(file),
					config,
				});
			} catch (err) {
				console.warn(`Failed to read ${file}:`, err);
			}
		}
	}

	configs.sort((a, b) => {
		const depthA = a.directory.split(path.sep).length;
		const depthB = b.directory.split(path.sep).length;
		return depthB - depthA;
	});

	workspacesCache = workspaces;
	return configs;
}

function findFormattingConfig(
	configs: LoadedFormattingFile[],
	file: string,
): FormattingFile | undefined {
	const resolved = path.resolve(file);

	return configs.find(({ directory }) => {
		const relative = path.relative(directory, resolved);
		return (
			relative === '' ||
			(!relative.startsWith('..') && !path.isAbsolute(relative))
		);
	})?.config;
}
