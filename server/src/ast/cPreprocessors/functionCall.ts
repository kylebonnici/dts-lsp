import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { CIdentifier } from './cIdentifier';
import { Expression } from './expression';
import { toRange } from '../../helpers';

export class FunctionCall extends Expression {
	constructor(
		public readonly functionName: CIdentifier,
		public readonly params: Expression[]
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

	evaluate(): string {
		throw new Error('Not Implimented');
	}

	toString() {
		return `${this.functionName.toString()}(${this.params
			.map((p) => p.toString())
			.join(',')})`;
	}
}
