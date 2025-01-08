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

import { BuildSemanticTokensPush, Token, TokenIndexes } from "../../types";
import { ASTBase } from "../base";
import { SymbolKind } from "vscode-languageserver";
import { getTokenModifiers, getTokenTypes, toRange } from "../../helpers";
import { DtcProperty } from "./property";
import { DeleteNode } from "./deleteNode";
import { LabelAssign } from "./label";
import { DeleteProperty } from "./deleteProperty";
import { LabelRef } from "./labelRef";
import { Node } from "../../context/node";
import { Keyword } from "../keyword";
import { Include } from "../cPreprocessors/include";

export class DtcBaseNode extends ASTBase {
  public openScope?: Token;
  public closeScope?: Token;

  constructor() {
    super();
  }

  get path(): string[] | undefined {
    if (!this.pathName) return ["__UNDEFINED__"];
    if (!this.parentNode || this instanceof DtcRootNode) return [this.pathName];
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
    child: DtcBaseNode | DeleteNode | DtcProperty | DeleteProperty | Include
  ) {
    this.addChild(child);
  }
}

export class DtcRootNode extends DtcBaseNode {
  constructor() {
    super();
    this.docSymbolsMeta = {
      name: "/",
      kind: SymbolKind.Class,
    };
  }
  get properties() {
    return this.children.filter((child) => child instanceof DtcProperty);
  }

  get deleteProperties() {
    return this.children.filter((child) => child instanceof DeleteProperty);
  }

  get nodes() {
    return this.children.filter(
      (child) => child instanceof DtcChildNode
    ) as DtcChildNode[];
  }

  get pathName() {
    return "/";
  }
}

export class DtcRefNode extends DtcBaseNode {
  private _labelReference: LabelRef | null = null;
  public resolveNodePath?: string[];

  constructor(public readonly labels: LabelAssign[] = []) {
    super();
    this.docSymbolsMeta = {
      name: "DTC Name",
      kind: SymbolKind.Class,
    };
    labels.forEach((label) => {
      super.addChild(label);
    });
  }

  set labelReference(labelReference: LabelRef | null) {
    if (this._labelReference)
      throw new Error("Only on label reference is allowed");
    this._labelReference = labelReference;
    this.docSymbolsMeta = {
      name: this.labelReference?.value ?? "DTC Name",
      kind: SymbolKind.Class,
    };
    this.addChild(labelReference);
  }

  get path(): string[] | undefined {
    if (this.resolveNodePath) {
      return this.resolveNodePath;
    }

    return super.path;
  }

  get labelReference() {
    return this._labelReference;
  }

  get nodes() {
    return this.children.filter((child) => child instanceof DtcChildNode);
  }

  get pathName() {
    return this.labelReference?.label
      ? `&${this.labelReference?.label?.value}`
      : undefined;
  }

  get properties() {
    return this.children.filter((child) => child instanceof DtcProperty);
  }

  get deleteProperties() {
    return this.children.filter((child) => child instanceof DeleteProperty);
  }
}

export class DtcChildNode extends DtcBaseNode {
  private _name: NodeName | null = null;

  constructor(
    public readonly labels: LabelAssign[] = [],
    public readonly omitIfNoRef?: Keyword
  ) {
    super();
    this.docSymbolsMeta = {
      name: "DTC Name",
      kind: SymbolKind.Class,
    };

    if (omitIfNoRef) {
      this.addChild(omitIfNoRef);
    }

    labels.forEach((label) => {
      this.addChild(label);
    });
  }

  set name(name: NodeName | null) {
    if (this._name) throw new Error("Only on label reference is allowed");
    this._name = name;
    this.docSymbolsMeta = {
      name: this._name?.toString() ?? "DTC Name",
      kind: SymbolKind.Class,
    };
    this.addChild(name);
  }

  get name() {
    return this._name;
  }

  get nodes() {
    return this.children.filter(
      (child) => child instanceof DtcChildNode
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
}

export class NodeName extends ASTBase {
  public linksTo?: Node;

  constructor(
    public readonly name: string,
    tokenIndex: TokenIndexes,
    public readonly address?: number
  ) {
    super(tokenIndex);
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }

  get value() {
    return this.name;
  }

  toString() {
    return this.address !== undefined
      ? `${this.name}@${this.address.toString(16)}`
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
    push(getTokenTypes("type"), getTokenModifiers("declaration"), {
      start: nameNewStart,
      end: nameNewStart,
    });
    if (this.address !== undefined) {
      const addressNewStart = {
        ...this.tokenIndexes.start,
        pos: {
          line: this.tokenIndexes.start.pos.line,
          col: this.tokenIndexes.start.pos.col + this.name.length + 1,
          len: this.tokenIndexes.start.pos.len - this.name.length - 1,
        },
      };

      const atSymbolNewStart = {
        ...this.tokenIndexes.start,
        pos: {
          line: this.tokenIndexes.start.pos.line,
          col: this.name.length + 2,
          len: 1,
        },
      };

      push(getTokenTypes("decorator"), getTokenModifiers("declaration"), {
        start: atSymbolNewStart,
        end: atSymbolNewStart,
      });

      push(getTokenTypes("number"), getTokenModifiers("declaration"), {
        start: addressNewStart,
        end: addressNewStart,
      });
    }
  }
}
