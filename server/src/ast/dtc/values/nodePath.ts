import { ASTBase } from '../../base';
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
		return [...this._pathParts];
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
