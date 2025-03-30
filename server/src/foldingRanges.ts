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
import { IfDefineBlock, IfElIfBlock } from "./ast/cPreprocessors/ifDefine";
import { start } from "repl";

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

const ifElIfBlockToRange = (
  ifDefBlock: IfElIfBlock | IfDefineBlock
): FoldingRange[] => {
  const ranges: FoldingRange[] = [];

  [
    ...(ifDefBlock instanceof IfElIfBlock
      ? ifDefBlock.ifBlocks.map((b) => ({
          start: (b.expression ?? b.keyword).lastToken,
          end: b.content?.lastToken ?? (b.expression ?? b.keyword).lastToken,
        }))
      : [
          {
            start: (ifDefBlock.ifDef.identifier ?? ifDefBlock.ifDef.keyword)
              .lastToken,
            end: ifDefBlock.ifDef.content?.lastToken,
          },
        ]),
    ifDefBlock.elseOption
      ? {
          start: ifDefBlock.elseOption.keyword.lastToken,
          end: ifDefBlock.elseOption.content?.lastToken,
        }
      : null,
  ].forEach((b) => {
    if (!b || !b.end) {
      return;
    }

    ranges.push({
      startLine: b.start.pos.line,
      startCharacter: b.start.pos.col,
      endLine: b.end.pos.line,
      endCharacter: b.end.pos.col + b.end.pos.len,
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
    return ifElIfBlockToRange(ast);
  }

  if (ast instanceof IfElIfBlock) {
    return ifElIfBlockToRange(ast);
  }

  return [];
};

export function getFoldingRanges(uri: string, parser: Parser): FoldingRange[] {
  return parser.allAstItems
    .filter((n) => n.uri === uri)
    .flatMap(toFoldingRange);
}
