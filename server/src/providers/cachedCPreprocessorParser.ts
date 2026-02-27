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

import type { MacroRegistryItem } from '../types';
import { CPreprocessorParser } from '../cPreprocessorParser';
import { normalizePath } from '../helpers';

let cachedCPreprocessorParserProvider:
	| CachedCPreprocessorParserProvider
	| undefined;

class CachedCPreprocessorParserProvider {
	private headerFiles = new Map<string, Map<string, CPreprocessorParser>>();
	private includeOwners = new WeakMap<CPreprocessorParser, Set<string>>();

	getCPreprocessorParser(
		fsPath: string,
		includes: string[],
		macros: Map<string, MacroRegistryItem>,
		parent: string,
	) {
		fsPath = normalizePath(fsPath);
		const key = `${Array.from(macros)
			.map((m) => m[1].macro.toString())
			.join('::')}`;
		const cache = this.headerFiles.get(fsPath)?.get(key);
		if (cache) {
			cache.reparse(macros);
			return cache;
		}

		console.log('No c-preprocessor cache', fsPath);
		const header = new CPreprocessorParser(fsPath, includes, macros);
		const set = this.includeOwners.get(header) ?? new Set();
		set.add(parent);
		this.includeOwners.set(header, set);
		if (!this.headerFiles.has(fsPath)) {
			this.headerFiles.set(fsPath, new Map());
		}
		this.headerFiles.get(fsPath)?.set(key, header);
		return header;
	}

	reset(fsPath: string) {
		fsPath = normalizePath(fsPath);
		const headers = this.headerFiles.get(fsPath);
		if (headers)
			Array.from(headers).forEach(([_, value]) => {
				console.log('disposing c-preprocessor cache for', fsPath);
				Array.from(this.includeOwners.get(value) ?? []).forEach(
					this.reset.bind(this),
				);
				this.headerFiles.delete(fsPath);
			});
	}
}

export function getCachedCPreprocessorParserProvider(): CachedCPreprocessorParserProvider {
	cachedCPreprocessorParserProvider ??=
		new CachedCPreprocessorParserProvider();
	return cachedCPreprocessorParserProvider;
}

export function resetCachedCPreprocessorParserProvider() {
	cachedCPreprocessorParserProvider = new CachedCPreprocessorParserProvider();
}
