import { ASTBase } from '../../base';
import { BuildSemanticTokensPush } from '../../../types';
import { AllValueType } from '../types';
import { DocumentSymbol } from 'vscode-languageserver';
import { Label } from '../label';

export class PropertyValue extends ASTBase {
	constructor(public readonly value: AllValueType, public readonly endLabels: Label[]) {
		super();
	}
	getDocumentSymbols(): DocumentSymbol[] {
		return [
			...(this.value?.getDocumentSymbols() ?? []),
			...this.endLabels.flatMap((label) => label.getDocumentSymbols() ?? []),
		];
	}

	buildSemanticTokens(builder: BuildSemanticTokensPush) {
		this.value?.buildSemanticTokens(builder);
		this.endLabels.forEach((label) => label?.buildSemanticTokens(builder));
	}
}
