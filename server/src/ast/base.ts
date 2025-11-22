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

import {
	Diagnostic,
	DocumentSymbol,
	Location,
	Position,
	Range,
	SymbolKind,
	WorkspaceSymbol,
} from 'vscode-languageserver';
import { SerializableASTBase } from '../types/index';
import {
	convertVirtualUriToDocumentUri,
	getTokenModifiers,
	getTokenTypes,
	isPathEqual,
	pathToFileURL,
	toRange,
} from '../helpers';
import type {
	BuildSemanticTokensPush,
	MacroRegistryItem,
	SemanticTokenModifiers,
	SemanticTokenType,
	Token,
	TokenIndexes,
} from '../types';

export class ASTBase {
	protected semanticTokenType?: SemanticTokenType;
	protected semanticTokenModifiers?: SemanticTokenModifiers;
	protected _children: ASTBase[] = [];
	public parentNode?: ASTBase;
	protected docSymbolsMeta?: { name: string; kind: SymbolKind };

	private _lastToken?: Token;
	private _firstToken?: Token;
	private allDescendantsCache?: ASTBase[];

	syntaxIssues: (() => Diagnostic)[] = [];
	resetableIssues: (() => Diagnostic)[] = [];
	get issues(): (() => Diagnostic)[] {
		return [...this.syntaxIssues, ...this.resetableIssues];
	}

	resetIssues() {
		this.resetableIssues = [];
		this.children.forEach((c) => c.resetIssues());
	}

	// all issues we want to this item to show when serialized
	get serializeIssues() {
		return this.issues.map((i) => i());
	}

	constructor(_tokenIndexes?: TokenIndexes) {
		this._firstToken = _tokenIndexes?.start;
		this._lastToken = _tokenIndexes?.end;
	}

	get firstToken(): Token {
		return this._firstToken ?? this._children[0].firstToken;
	}

	set firstToken(token: Token | undefined) {
		this._firstToken = token;
	}

	get lastToken(): Token {
		return (
			this._lastToken ??
			this._children[this._children.length - 1]?.lastToken ??
			this.firstToken
		);
	}

	set lastToken(token: Token | undefined) {
		this._lastToken = token;
	}

	get uri(): string {
		return this.firstToken.uri;
	}

	getTopMostAstNodeForFile(file: string): ASTBase[] {
		if (isPathEqual(file, this.uri)) return [this];
		return this.children.flatMap((c) => c.getTopMostAstNodeForFile(file));
	}

	getDocumentSymbols(uri: string): DocumentSymbol[] {
		if (!this.docSymbolsMeta)
			return this.children.flatMap(
				(child) => child.getDocumentSymbols(uri) ?? [],
			);

		if (!isPathEqual(this.uri, uri)) return [];

		const range = toRange(this);
		return [
			{
				name: this.docSymbolsMeta.name
					? this.docSymbolsMeta.name
					: '__UNSET__',
				kind: this.docSymbolsMeta.kind,
				range: range,
				selectionRange: range,
				children: [
					...this.children.flatMap(
						(child) => child.getDocumentSymbols(uri) ?? [],
					),
				],
			},
		];
	}

	getWorkspaceSymbols(): WorkspaceSymbol[] {
		if (!this.docSymbolsMeta)
			return this.children.flatMap(
				(child) => child.getWorkspaceSymbols() ?? [],
			);

		const kind = this.docSymbolsMeta.kind;
		if (
			![SymbolKind.File, SymbolKind.Class, SymbolKind.Constant].some(
				(k) => k === kind,
			)
		) {
			return [];
		}

		const virtualDoc = convertVirtualUriToDocumentUri(this.uri);
		const range = virtualDoc?.range ?? toRange(this);
		return [
			{
				location: Location.create(
					pathToFileURL(virtualDoc?.docUri ?? this.uri),
					range,
				),
				name: this.docSymbolsMeta.name
					? this.docSymbolsMeta.name
					: '__UNSET__',
				kind: this.docSymbolsMeta.kind,
			},
			...this.children
				.flatMap((child) => child.getWorkspaceSymbols() ?? [])
				.filter(
					(ds) =>
						ds.kind === SymbolKind.File ||
						ds.kind === SymbolKind.Class ||
						ds.kind === SymbolKind.Constant,
				),
		];
	}

	buildSemanticTokens(push: BuildSemanticTokensPush) {
		this._children.forEach((child) => child.buildSemanticTokens(push));

		if (!this.semanticTokenType || !this.semanticTokenModifiers) {
			return;
		}

		push(
			getTokenTypes(this.semanticTokenType),
			getTokenModifiers(this.semanticTokenModifiers),
			this.firstToken,
			this.lastToken,
		);
	}

	get children(): readonly ASTBase[] {
		return this._children;
	}

	get allDescendants(): ASTBase[] {
		this.allDescendantsCache ??= [
			...this._children,
			...this._children.flatMap((child) => child.allDescendants),
		];

		return this.allDescendantsCache;
	}

	protected addChild(child: ASTBase | null | undefined) {
		if (child) {
			child.parentNode = this;
			this._children.push(child);
		}
		this.allDescendantsCache = undefined;
	}

	isAncestorOf(ast: ASTBase): boolean {
		return this.children.some((c) => c === ast || c.isAncestorOf(ast));
	}

	toPrettyString(_macros: Map<string, MacroRegistryItem>) {
		return this.toString();
	}

	toString(_radix?: number) {
		return 'TODO';
	}

	get range(): Range {
		return Range.create(
			Position.create(this.firstToken.pos.line, this.firstToken.pos.col),
			Position.create(this.lastToken.pos.line, this.lastToken.pos.colEnd),
		);
	}

	protected get serializeUri() {
		return pathToFileURL(this.uri);
	}

	serialize(_macros: Map<string, MacroRegistryItem>): SerializableASTBase {
		return {
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}
