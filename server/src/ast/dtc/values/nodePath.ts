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

import { SymbolKind } from "vscode-languageserver";
import { ASTBase } from "../../base";
import { NodeName } from "../node";
import { SerializableNodePath } from "../../../types/index";

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
    return this._pathParts.map((p) => p?.toString() ?? "<NULL>").join("/");
  }
}

export class NodePathRef extends ASTBase {
  constructor(public readonly path: NodePath | null) {
    super();
    this.docSymbolsMeta = {
      name: `/${this.path?.toString() ?? ""}`,
      kind: SymbolKind.Namespace,
    };
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
    this.addChild(path);
  }

  toString() {
    return `&${this.path?.toString() ?? "NULL"}`;
  }

  toJson() {
    return -1;
  }

  serialize(): SerializableNodePath {
    return new SerializableNodePath(
      this.path?.toString() ?? null,
      this.uri,
      this.range
    );
  }
}
