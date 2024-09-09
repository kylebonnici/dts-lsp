import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { Label, LabelAssign } from '../label';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';

export class LabelRefValue extends ASTBase {
	constructor(public readonly value: Label | null, public readonly labels: LabelAssign[]) {
		super();
		this.docSymbolsMeta = {
			name: this.value?.value ?? 'NULL',
			kind: SymbolKind.String,
		};
		this.labels.forEach((label) => this.addChild(label));
		this.addChild(value);
	}
}
