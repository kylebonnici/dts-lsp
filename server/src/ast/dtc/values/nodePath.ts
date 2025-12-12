/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { SymbolKind } from 'vscode-languageserver';
import { ASTBase } from '../../base';
import { NodeName } from '../node';
import { SerializableNodePath } from '../../../types/index';
import { BuildSemanticTokensPush } from '../../../types';
import { getTokenModifiers, getTokenTypes } from '../../../helpers';

export class NodePath extends ASTBase {
	private _pathParts: (NodeName | null)[] = [];

	constructor() {
		super();
	}

	addPath(part: NodeName | null, pathDivider?: ASTBase) {
		this._pathParts.push(part);
		if (pathDivider) {
			this.addChild(pathDivider);
		}
		this.addChild(part);
	}

	get pathParts() {
		return [...this._pathParts];
	}

	toString() {
		return this._pathParts.map((p) => p?.toString() ?? '<NULL>').join('/');
	}

	buildSemanticTokens(push: BuildSemanticTokensPush) {
		this._children.forEach((child) => {
			if (child instanceof NodeName) {
				child.buildSemanticTokens(push);
			} else {
				push(
					getTokenTypes('operator'),
					getTokenModifiers('declaration'),
					child.firstToken,
					child.lastToken,
				);
			}
		});
	}
}

export class NodePathRef extends ASTBase {
	constructor(public readonly path: NodePath | null) {
		super();
		this.docSymbolsMeta = {
			name: `/${this.path?.toString() ?? ''}`,
			kind: SymbolKind.Namespace,
		};
		this.addChild(path);
	}

	toString() {
		return `&${this.path?.toString() ?? 'NULL'}`;
	}

	toJson() {
		return -1;
	}

	serialize(): SerializableNodePath {
		const nodePath = this.path?.toString();
		return {
			type: 'NODE_PATH',
			nodePath: nodePath === '/' ? nodePath : `/${nodePath ?? ''}`,
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}
