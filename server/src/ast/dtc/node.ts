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
  BuildSemanticTokensPush,
  MacroRegistryItem,
  Token,
  TokenIndexes,
} from "../../types";
import { ASTBase } from "../base";
import { Position, Range, SymbolKind } from "vscode-languageserver";
import {
  createTokenIndex,
  getTokenModifiers,
  getTokenTypes,
} from "../../helpers";
import { DtcProperty } from "./property";
import { DeleteNode } from "./deleteNode";
import { LabelAssign } from "./label";
import { DeleteProperty } from "./deleteProperty";
import { LabelRef } from "./labelRef";
import { Node } from "../../context/node";
import { Keyword } from "../keyword";
import { Include } from "../cPreprocessors/include";
import {
  SerializableNodeAddress,
  SerializableFullNodeName,
  SerializableNodeName,
  SerializableChildNode,
  SerializableNodeRef as SerializableRefNode,
  SerializableRootNode,
} from "../../types/index";

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

  get name() {
    return new NodeName("/", createTokenIndex(this.firstToken));
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

  serialize(macros: Map<string, MacroRegistryItem>): SerializableRootNode {
    return new SerializableRootNode(
      this.properties.map((p) => p.serialize(macros)),
      this.nodes.map((n) => n.serialize(macros)),
      this.uri,
      this.range
    );
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

  serialize(macros: Map<string, MacroRegistryItem>): SerializableRefNode {
    return new SerializableRefNode(
      this.labelReference?.serialize() ?? null,
      this.properties.map((p) => p.serialize(macros)),
      this.nodes.map((n) => n.serialize(macros)),
      this.uri,
      this.range
    );
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

  serialize(macros: Map<string, MacroRegistryItem>): SerializableChildNode {
    return new SerializableChildNode(
      this.name?.serialize() ?? null,
      this.properties.map((p) => p.serialize(macros)),
      this.nodes.map((n) => n.serialize(macros)),
      this.uri,
      this.range
    );
  }
}

export class NodeAddress extends ASTBase {
  constructor(public readonly address: number, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return this.address.toString(16);
  }

  serialize(): SerializableNodeAddress {
    return new SerializableNodeAddress(this.address, this.uri, this.range);
  }
}

export class NodeName extends ASTBase {
  public linksTo?: Node;

  constructor(
    public readonly name: string,
    tokenIndex: TokenIndexes,
    private _address?: NodeAddress[]
  ) {
    super(tokenIndex);
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }

  get value() {
    return this.name;
  }

  get address() {
    return this._address;
  }

  set address(nodeAddress: NodeAddress[] | undefined) {
    if (this._address) {
      throw new Error("Address can only be set once");
    }

    if (nodeAddress) {
      this.lastToken = undefined;
      this._address = nodeAddress;
      nodeAddress.forEach((a) => this.addChild(a));
    }
  }

  toString() {
    return this._address !== undefined
      ? `${this.name}@${this._address.map((v) => v.toString()).join(",")}`
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
      this.address.forEach((a) => {
        push(getTokenTypes("decorator"), getTokenModifiers("declaration"), {
          start: a.lastToken.prevToken!,
          end: a.lastToken.prevToken!,
        });
        a.buildSemanticTokens(push);
      });
    }
  }

  serialize(): SerializableFullNodeName {
    return new SerializableFullNodeName(
      this.toString(),
      new SerializableNodeName(
        this.name,
        this.uri,
        Range.create(
          Position.create(
            this.tokenIndexes.start.pos.line,
            this.tokenIndexes.start.pos.col
          ),
          Position.create(
            this.tokenIndexes.start.pos.line,
            this.tokenIndexes.start.pos.colEnd
          )
        )
      ),
      this.address?.map((add) => add.serialize()) ?? null,
      this.uri,
      this.range
    );
  }
}
