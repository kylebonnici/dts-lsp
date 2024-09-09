import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { PropertyName } from './property';

export class DeleteProperty extends ASTBase {
	public _propertyName: PropertyName | null = null;

	constructor(keyword: Keyword) {
		super();
		this.docSymbolsMeta = {
			name: 'Delete Property',
			kind: SymbolKind.Function,
		};
		this.addChild(keyword);
	}

	set propertyName(propertyName: PropertyName | null) {
		if (this._propertyName) throw new Error('Only on property name is allowed');
		this._propertyName = propertyName;
		this.addChild(propertyName);
	}

	get propertyName() {
		return this._propertyName;
	}
}
