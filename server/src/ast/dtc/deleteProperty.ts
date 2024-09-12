import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../base';
import { Keyword } from '../keyword';
import { toRange } from '../../helpers';
import { BuildSemanticTokensPush } from '../../types';
import { PropertyName } from './property';
import { DeleteBase } from './delete';

export class DeleteProperty extends DeleteBase {
	public _propertyName: PropertyName | null = null;

	constructor(keyword: Keyword) {
		super('Delete Property', keyword);
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
