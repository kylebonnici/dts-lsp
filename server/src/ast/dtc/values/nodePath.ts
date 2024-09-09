import { ASTBase } from '../../base';
import { toRange } from '../../../helpers';
import { BuildSemanticTokensPush } from '../../../types';
import { LabelAssign } from '../label';
import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { NodeName } from '../node';

export class NodePath extends ASTBase {
	private _pathParts: (NodeName | null)[] = [];

	constructor() {
		super();
		this.docSymbolsMeta = {
			name: this._pathParts.join('/'),
			kind: SymbolKind.Key,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	addPath(part: NodeName | null) {
		this._pathParts.push(part);
		this.addChild(part);
	}

	get pathParts() {
		return this._pathParts;
	}
}

export class NodePathRef extends ASTBase {
	constructor(public readonly path: NodePath | null) {
		super();
		this.docSymbolsMeta = {
			name: 'Node Path Referance',
			kind: SymbolKind.Variable,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
}

export class NodePathValue extends ASTBase {
	constructor(
		public readonly path: NodePathRef | null,
		public readonly labels: LabelAssign[]
	) {
		super();
		this.docSymbolsMeta = {
			name: 'Node Path',
			kind: SymbolKind.Variable,
		};
		this.labels.forEach((label) => {
			this.addChild(label);
		});
	}
}
