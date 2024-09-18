import { SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { basename } from 'path';

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
	constructor(public readonly path: string, public readonly relative: boolean) {
		super();
		this.docSymbolsMeta = {
			name: basename(this.path),
			kind: SymbolKind.File,
		};
		this.semanticTokenType = 'string';
		this.semanticTokenModifiers = 'declaration';
	}
}
