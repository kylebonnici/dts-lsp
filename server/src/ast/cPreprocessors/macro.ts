import { SymbolKind } from 'vscode-languageserver';
import { Expression } from './expression';
import { CIdentifier } from './cIdentifier';
import { FunctionDefinition } from './functionDefinition';
import { Keyword } from '../keyword';
import { ASTBase } from '../base';
import { Token, TokenIndexes } from '../../types';

export class CMacroContent extends ASTBase {
	constructor(tokenIndexes: TokenIndexes, public readonly content: Token[]) {
		super(tokenIndexes);
	}
}

export class CMacro extends ASTBase {
	constructor(
		public readonly keyword: Keyword,
		public readonly identifier: CIdentifier | FunctionDefinition,
		public readonly content?: CMacroContent
	) {
		super();
		const simple = identifier instanceof CIdentifier;
		this.docSymbolsMeta = {
			name: this.name,
			kind: simple ? SymbolKind.Variable : SymbolKind.Function,
		};
		this.semanticTokenType = simple ? 'function' : 'variable';
		this.semanticTokenModifiers = 'declaration';
		this.addChild(keyword);
		this.addChild(this.identifier);
		if (this.content) {
			this.addChild(this.content);
		}
	}

	get name() {
		return this.identifier instanceof CIdentifier
			? this.identifier.name
			: this.identifier.functionName.name;
	}

	toString() {
		// TODO
		return `${this.identifier.toString()} ${
			this.content?.content.map((c) => c.value).toString() ?? ''
		}`;
	}
}
