import { SymbolKind } from 'vscode-languageserver';
import { Expression } from './expression';
import { CIdentifier } from './cIdentifier';
import { FunctionDefinition } from './functionDefinition';

export class CMacro extends Expression {
	constructor(
		public readonly identifier: CIdentifier | FunctionDefinition,
		public readonly expression?: Expression
	) {
		super();
		const simple = identifier instanceof CIdentifier;
		this.docSymbolsMeta = {
			name: this.name,
			kind: simple ? SymbolKind.Variable : SymbolKind.Function,
		};
		this.semanticTokenType = simple ? 'function' : 'variable';
		this.semanticTokenModifiers = 'declaration';
		this.addChild(this.identifier);
		if (this.expression) {
			this.addChild(this.expression);
		}
	}

	get name() {
		return this.identifier instanceof CIdentifier
			? this.identifier.name
			: this.identifier.functionName.name;
	}

	evaluate(): string {
		throw new Error('Not Implimented');
	}
}
