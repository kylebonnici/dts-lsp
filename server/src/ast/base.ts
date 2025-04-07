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
  getTokenModifiers,
  getTokenTypes,
  pathToFileURL,
  toRange,
} from "../helpers";
import type {
  BuildSemanticTokensPush,
  SemanticTokenModifiers,
  SemanticTokenType,
  Token,
  TokenIndexes,
} from "../types";
import {
  DocumentSymbol,
  Location,
  SymbolKind,
  WorkspaceSymbol,
} from "vscode-languageserver";

export class ASTBase {
  protected semanticTokenType?: SemanticTokenType;
  protected semanticTokenModifiers?: SemanticTokenModifiers;
  protected _children: ASTBase[] = [];
  public parentNode?: ASTBase;
  protected docSymbolsMeta?: { name: string; kind: SymbolKind };

  private _lastToken?: Token;
  private _fisrtToken?: Token;
  private allDescendantsCache?: ASTBase[];

  constructor(_tokenIndexes?: TokenIndexes) {
    this._fisrtToken = _tokenIndexes?.start;
    this._lastToken = _tokenIndexes?.end;
  }

  get sortKey(): number {
    return this.firstToken.sortKey ?? this.parentNode?.sortKey ?? -1;
  }

  get firstToken(): Token {
    return this._fisrtToken ?? this._children[0].tokenIndexes.start;
  }

  set firstToken(token: Token | undefined) {
    this._fisrtToken = token;
  }

  get lastToken(): Token {
    return (
      this._lastToken ?? this._children.at(-1)?.lastToken ?? this.firstToken
    );
  }

  set lastToken(token: Token | undefined) {
    this._lastToken = token;
  }

  get uri(): string {
    return this.firstToken.uri;
  }

  get tokenIndexes(): TokenIndexes {
    return {
      start: this.firstToken,
      end: this.lastToken,
    };
  }

  getDocumentSymbols(uri: string): DocumentSymbol[] {
    if (!this.docSymbolsMeta)
      return this.children.flatMap(
        (child) => child.getDocumentSymbols(uri) ?? []
      );

    if (this.uri !== uri) return [];

    const range = toRange(this);
    return [
      {
        name: this.docSymbolsMeta.name ? this.docSymbolsMeta.name : "__UNSET__",
        kind: this.docSymbolsMeta.kind,
        range: range,
        selectionRange: range,
        children: [
          ...this.children.flatMap(
            (child) => child.getDocumentSymbols(uri) ?? []
          ),
        ],
      },
    ];
  }

  getWorkspaceSymbols(): WorkspaceSymbol[] {
    if (!this.docSymbolsMeta)
      return this.children.flatMap(
        (child) => child.getWorkspaceSymbols() ?? []
      );

    const kind = this.docSymbolsMeta.kind;
    if (
      ![SymbolKind.File, SymbolKind.Class, SymbolKind.Namespace].some(
        (k) => k === kind
      )
    ) {
      return [];
    }

    const range = toRange(this);
    return [
      {
        location: Location.create(pathToFileURL(this.uri), range),
        name: this.docSymbolsMeta.name ? this.docSymbolsMeta.name : "__UNSET__",
        kind: this.docSymbolsMeta.kind,
      },
      ...this.children
        .flatMap((child) => child.getWorkspaceSymbols() ?? [])
        .filter(
          (ds) =>
            ds.kind === SymbolKind.File ||
            ds.kind === SymbolKind.Class ||
            ds.kind === SymbolKind.Namespace
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
      this.tokenIndexes
    );
  }

  get children() {
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
      this.children.push(child);
    }
    this.allDescendantsCache = undefined;
  }
}
