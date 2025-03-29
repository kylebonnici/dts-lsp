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

import { MacroRegistryItem } from "../types";
import { CPreprocessorParser } from "../cPreprocessorParser";

let cachedCPreprocessorParserProvider:
  | CachedCPreprocessorParserProvider
  | undefined;

class CachedCPreprocessorParserProvider {
  private headerFiles = new Map<string, CPreprocessorParser>();
  private includeOwners = new WeakMap<CPreprocessorParser, Set<string>>();

  getCPreprocessorParser(
    uri: string,
    inludes: string[],
    macros: Map<string, MacroRegistryItem>,
    parent: string
  ) {
    const cache = this.headerFiles.get(uri);
    if (cache) {
      cache.reparse(macros);
      return cache;
    }

    console.log("No cpreprocess cache", uri);
    const header = new CPreprocessorParser(uri, inludes, macros);
    const set = this.includeOwners.get(header) ?? new Set();
    set.add(parent);
    this.includeOwners.set(header, set);
    this.headerFiles.set(uri, header);
    return header;
  }

  reset(uri: string) {
    const header = this.headerFiles.get(uri);
    if (header) {
      console.log("disposing cpreprocessor cache for", uri);
      Array.from(this.includeOwners.get(header) ?? []).forEach(
        this.reset.bind(this)
      );
      this.headerFiles.delete(uri);
    }
  }
}

export function getCachedCPreprocessorParserProvider(): CachedCPreprocessorParserProvider {
  cachedCPreprocessorParserProvider ??= new CachedCPreprocessorParserProvider();
  return cachedCPreprocessorParserProvider;
}

export function resetCachedCPreprocessorParserProvider() {
  cachedCPreprocessorParserProvider = new CachedCPreprocessorParserProvider();
}
