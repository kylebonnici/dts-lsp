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
		uri: string,
		inludes: string[],
		macros: Map<string, MacroRegistryItem>,
		parent: string,
	) {
		uri = normalizePath(uri);
		const key = `${Array.from(macros)
			.map((m) => m[1].macro.toString())
			.join('::')}`;
		const cache = this.headerFiles.get(uri)?.get(key);
		if (cache) {
			cache.reparse(macros);
			return cache;
		}

		console.log('No cpreprocess cache', uri);
		const header = new CPreprocessorParser(uri, inludes, macros);
		const set = this.includeOwners.get(header) ?? new Set();
		set.add(parent);
		this.includeOwners.set(header, set);
		if (!this.headerFiles.has(uri)) {
			this.headerFiles.set(uri, new Map());
		}
		this.headerFiles.get(uri)?.set(key, header);
		return header;
	}

	reset(uri: string) {
		uri = normalizePath(uri);
		const headers = this.headerFiles.get(uri);
		if (headers)
			Array.from(headers).forEach((header) => {
				if (header[1]) {
					console.log('disposing cpreprocessor cache for', uri);
					Array.from(this.includeOwners.get(header[1]) ?? []).forEach(
						this.reset.bind(this),
					);
					this.headerFiles.delete(uri);
				}
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
