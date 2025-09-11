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

import { Position, Range, SymbolKind } from 'vscode-languageserver';
import {
	BuildSemanticTokensPush,
	MacroRegistryItem,
	Token,
	TokenIndexes,
} from '../../types';
import { ASTBase } from '../base';
import {
	createTokenIndex,
	getTokenModifiers,
	getTokenTypes,
} from '../../helpers';
import { Node } from '../../context/node';
import { Keyword } from '../keyword';
import { Include } from '../cPreprocessors/include';
import {
	SerializableNodeAddress,
	SerializableFullNodeName,
	SerializableChildNode,
	SerializableNodeRef as SerializableRefNode,
	SerializableRootNode,
} from '../../types/index';
import { DtcProperty } from './property';
import { DeleteNode } from './deleteNode';
import { LabelAssign } from './label';
import { DeleteProperty } from './deleteProperty';
import { LabelRef } from './labelRef';
import { NodePathRef } from './values/nodePath';
import { Comment, CommentBlock } from './comment';

export class DtcBaseNode extends ASTBase {
	public topComment?: Comment | CommentBlock;
	public endComment?: Comment | CommentBlock;
	public openScope?: Token;
	public closeScope?: Token;

	constructor() {
		super();
	}

	get path(): string[] | undefined {
		if (!this.pathName) return ['__UNDEFINED__'];
		if (!this.parentNode || this instanceof DtcRootNode)
			return [this.pathName];
		if (!(this.parentNode instanceof DtcBaseNode)) return undefined;
		const parentPath = this.parentNode.path;
		if (!parentPath) return [this.pathName];

		return [...parentPath, this.pathName];
	}

	get pathName(): string | undefined {
		return undefined;
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcBaseNode);
	}

	get deleteNodes() {
		return this.children.filter((child) => child instanceof DeleteNode);
	}

	public addNodeChild(
		child:
			| DtcBaseNode
			| DeleteNode
			| DtcProperty
			| DeleteProperty
			| Include,
	) {
		this.addChild(child);
	}
}

export class DtcRootNode extends DtcBaseNode {
	constructor() {
		super();
		this.docSymbolsMeta = {
			name: '/',
			kind: SymbolKind.Class,
		};
	}

	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get name() {
		return new NodeName('/', createTokenIndex(this.firstToken));
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	get nodes() {
		return this.children.filter(
			(child) => child instanceof DtcChildNode,
		) as DtcChildNode[];
	}

	get pathName() {
		return '/';
	}

	serialize(macros: Map<string, MacroRegistryItem>): SerializableRootNode {
		return {
			type: 'ROOT',
			properties: this.properties.map((p) => p.serialize(macros)),
			nodes: this.nodes.map((n) => n.serialize(macros)),
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class DtcRefNode extends DtcBaseNode {
	private _reference: LabelRef | NodePathRef | null = null;
	public resolveNodePath?: string[];

	constructor(public readonly labels: LabelAssign[] = []) {
		super();
		this.docSymbolsMeta = {
			name: 'DTC Name',
			kind: SymbolKind.Class,
		};
		labels.forEach((label) => {
			super.addChild(label);
		});
	}

	get serializeIssues() {
		return [...this.issues, ...(this.reference?.issues ?? [])].map((i) =>
			i(),
		);
	}

	set reference(reference: LabelRef | NodePathRef | null) {
		if (this._reference)
			throw new Error('Only on label reference is allowed');

		this._reference = reference;
		let name: string | undefined;
		if (reference instanceof LabelRef) {
			name = reference.value;
		} else {
			name = reference?.path?.pathParts.at(-1)?.name ?? 'DTC Name';
		}
		this.docSymbolsMeta = {
			name: name ?? 'DTC Name',
			kind: SymbolKind.Class,
		};
		this.addChild(reference);
	}

	get path(): string[] | undefined {
		if (this.resolveNodePath) {
			return this.resolveNodePath;
		}

		return super.path;
	}

	get reference() {
		return this._reference;
	}

	get nodes() {
		return this.children.filter((child) => child instanceof DtcChildNode);
	}

	get pathName() {
		if (this.reference instanceof LabelRef && this.reference.label?.value) {
			return `&${this.reference.label.value}`;
		}
	}

	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	serialize(macros: Map<string, MacroRegistryItem>): SerializableRefNode {
		return {
			type: 'REF',
			name: this.reference?.serialize() ?? null,
			properties: this.properties.map((p) => p.serialize(macros)),
			nodes: this.nodes.map((n) => n.serialize(macros)),
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class DtcChildNode extends DtcBaseNode {
	private _name: NodeName | null = null;

	constructor(
		public readonly labels: LabelAssign[] = [],
		public readonly omitIfNoRef?: Keyword,
	) {
		super();
		this.docSymbolsMeta = {
			name: 'DTC Name',
			kind: SymbolKind.Class,
		};

		if (omitIfNoRef) {
			this.addChild(omitIfNoRef);
		}

		labels.forEach((label) => {
			this.addChild(label);
		});
	}

	get serializeIssues() {
		return [...this.issues, ...(this.name?.issues ?? [])].map((i) => i());
	}

	set name(name: NodeName | null) {
		if (this._name) throw new Error('Only on label reference is allowed');
		this._name = name;
		this.docSymbolsMeta = {
			name: this._name?.toString() ?? 'DTC Name',
			kind: SymbolKind.Class,
		};
		this.addChild(name);
	}

	get name() {
		return this._name;
	}

	get nodes() {
		return this.children.filter(
			(child) => child instanceof DtcChildNode,
		) as DtcChildNode[];
	}

	get pathName() {
		return this._name?.toString();
	}
	get properties() {
		return this.children.filter((child) => child instanceof DtcProperty);
	}

	get deleteProperties() {
		return this.children.filter((child) => child instanceof DeleteProperty);
	}

	serialize(macros: Map<string, MacroRegistryItem>): SerializableChildNode {
		return {
			type: 'CHILD',
			name: this.name?.serialize() ?? null,
			properties: this.properties.map((p) => p.serialize(macros)),
			nodes: this.nodes.map((n) => n.serialize(macros)),
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class NodeAddress extends ASTBase {
	constructor(
		public readonly address: number[],
		tokenIndex: TokenIndexes,
	) {
		super(tokenIndex);
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	toString() {
		return (
			this.address
				?.map((v, i) => v.toString(16).padStart(i ? 8 : 0, '0'))
				.join('') ?? 'NaN'
		);
	}

	serialize(): SerializableNodeAddress {
		return {
			address: this.address,
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class NodeName extends ASTBase {
	public linksTo?: Node;

	constructor(
		public readonly name: string,
		tokenIndex: TokenIndexes,
		private _address?: NodeAddress[],
	) {
		super(tokenIndex);
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}

	get value() {
		return this.name;
	}

	get address() {
		return this._address;
	}

	set address(nodeAddress: NodeAddress[] | undefined) {
		if (this._address) {
			throw new Error('Address can only be set once');
		}

		if (nodeAddress) {
			this.lastToken = undefined;
			this._address = nodeAddress;
			nodeAddress.forEach((a) => this.addChild(a));
		}
	}

	get fullAddress() {
		return this._address
			? [...this._address.flatMap((a) => a.address)]
			: undefined;
	}

	toString() {
		return this._address !== undefined
			? `${this.name}@${this._address.map((v) => v.toString()).join(',')}`
			: this.name;
	}

	buildSemanticTokens(push: BuildSemanticTokensPush): void {
		if (!this.tokenIndexes?.start || !this.tokenIndexes.start.value) return;
		const nameNewStart = {
			...this.tokenIndexes.start,
			pos: {
				...this.tokenIndexes.start.pos,
				len: this.name.length,
			},
		};
		push(getTokenTypes('type'), getTokenModifiers('declaration'), {
			start: nameNewStart,
			end: nameNewStart,
		});

		if (this.address !== undefined) {
			this.address.forEach((a) => {
				push(
					getTokenTypes('decorator'),
					getTokenModifiers('declaration'),
					{
						start: a.firstToken,
						end: a.lastToken,
					},
				);
				a.buildSemanticTokens(push);
			});
		}
	}

	get serializeIssues() {
		return [
			...this.issues,
			...(this._address?.flatMap((add) => add.issues) ?? []),
		].map((i) => i());
	}

	serialize(): SerializableFullNodeName {
		return {
			fullName: this.toString(),
			name: {
				name: this.name,
				uri: this.serializeUri,
				range: Range.create(
					Position.create(
						this.tokenIndexes.start.pos.line,
						this.tokenIndexes.start.pos.col,
					),
					Position.create(
						this.tokenIndexes.start.pos.line,
						this.tokenIndexes.start.pos.colEnd,
					),
				),
				issues: this.serializeIssues,
			},
			address: this.address?.map((add) => add.serialize()) ?? null,
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}
