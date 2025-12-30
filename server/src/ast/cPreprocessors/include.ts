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

import { basename } from 'path';
import { SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { TokenIndexes } from '../../types';
import { Comment, CommentBlock } from '../dtc/comment';

export class Include extends ASTBase {
	public topComment?: Comment | CommentBlock;
	public endComment?: Comment | CommentBlock;
	private _resolvedPath?: string;

	constructor(
		public readonly keyword: Keyword,
		public readonly path: IncludePath,
	) {
		super();
		this.docSymbolsMeta = {
			name: `Include ${path}`,
			kind: SymbolKind.File,
		};
		this.addChild(keyword);
		this.addChild(path);
	}

	get resolvedPath(): string | undefined {
		return this._resolvedPath;
	}

	set resolvedPath(resolvedPath: string | undefined) {
		this.docSymbolsMeta = {
			name: `Include ${resolvedPath}`,
			kind: SymbolKind.File,
		};
		this._resolvedPath = resolvedPath;
	}
}

export class IncludePath extends ASTBase {
	constructor(
		private readonly _path: string,
		public readonly relative: boolean,
		tokenIndexes: TokenIndexes,
	) {
		super(tokenIndexes);
		this.docSymbolsMeta = {
			name: basename(this.path),
			kind: SymbolKind.File,
		};
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
	}

	get path() {
		if (this.relative) {
			return this._path.slice(1, -1);
		}
		return this._path;
	}
}
