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
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
		this.addChild(path);
	}
}

export class NodePathValue extends ASTBase {
	constructor(
		public readonly path: NodePathRef | null,
		public readonly labels: LabelAssign[]
	) {
		super();
		this.addChild(path);
		this.labels.forEach((label) => {
			this.addChild(label);
		});
	}
}
