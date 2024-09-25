import { SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { basename } from 'path';
import { TokenIndexes } from '../../types';

export class Include extends ASTBase {
	constructor(public readonly keyword: Keyword, public readonly path: IncludePath) {
		super();
		this.docSymbolsMeta = {
			name: 'Include',
			kind: SymbolKind.File,
		};
		this.addChild(keyword);
		this.addChild(path);
	}
}

export class IncludePath extends ASTBase {
	constructor(
		private readonly _path: string,
		public readonly relative: boolean,
		tokenIndexes: TokenIndexes
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
