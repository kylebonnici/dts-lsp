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

import { FoldingRange, FoldingRangeKind } from "vscode-languageserver";
import { DtcBaseNode } from "./ast/dtc/node";
import { Parser } from "./parser";

const nodeToRange = (dtcNode: DtcBaseNode): FoldingRange[] => {
  if (!dtcNode.openScope || !dtcNode.closeScope?.prevToken) {
    return dtcNode.nodes.flatMap(nodeToRange);
  }
  const range: FoldingRange = {
    startLine: dtcNode.openScope.pos.line,
    startCharacter: dtcNode.openScope.pos.col,
    endLine: dtcNode.closeScope.prevToken.pos.line,
    endCharacter: dtcNode.closeScope.prevToken.pos.col,
    kind: FoldingRangeKind.Region,
  };

  return [range, ...dtcNode.nodes.flatMap(nodeToRange)];
};
export function getFoldingRanges(uri: string, parser: Parser): FoldingRange[] {
  return parser.rootDocument.nodes
    .filter((n) => n.uri === uri)
    .flatMap(nodeToRange);
}
