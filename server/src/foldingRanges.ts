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
import { ASTBase } from "./ast/base";
import { IfDefineBlock } from "./ast/cPreprocessors/ifDefine";

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

const ifDefBlockToRange = (ifDefBlock: IfDefineBlock): FoldingRange[] => {
  const ranges: FoldingRange[] = [];

  [ifDefBlock.ifDef.content, ifDefBlock.elseOption?.content].forEach((b) => {
    if (!b) {
      return;
    }

    ranges.push({
      startLine: b.firstToken.prevToken!.pos.line,
      startCharacter: b.firstToken.prevToken!.pos.col,
      endLine: b.lastToken.pos.line,
      endCharacter: b.lastToken.pos.col + b.lastToken.pos.len,
      kind: FoldingRangeKind.Region,
    });
  });

  return ranges;
};

const toFoldingRange = (ast: ASTBase): FoldingRange[] => {
  if (ast instanceof DtcBaseNode) {
    return nodeToRange(ast);
  }

  if (ast instanceof IfDefineBlock) {
    return ifDefBlockToRange(ast);
  }

  return [];
};

export function getFoldingRanges(uri: string, parser: Parser): FoldingRange[] {
  return parser.allAstItems
    .filter((n) => n.uri === uri)
    .flatMap(toFoldingRange);
}
