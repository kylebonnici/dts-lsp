import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { CIdentifier } from './cIdentifier';
import { toRange } from '../../helpers';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';

export class Variadic extends Keyword {
	toString() {
		return '...';
	}
}

export class FunctionDefinition extends ASTBase {
	constructor(
		public readonly functionName: CIdentifier,
		public readonly params: (CIdentifier | Variadic)[]
	) {
		super();
		this.addChild(functionName);
		this.params.forEach((p) => this.addChild(p));
	}

	getDocumentSymbols(): DocumentSymbol[] {
		return [
			{
				name: this.functionName.name,
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.params.flatMap((p) => p.getDocumentSymbols()),
			},
		];
	}

	toString() {
		return `${this.functionName}(${this.params.map((p) => p.toString()).join(',')})`;
	}
}