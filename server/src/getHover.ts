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

import { Hover, HoverParams, MarkupContent } from "vscode-languageserver";
import { SearchableResult } from "./types";
import { nodeFinder, toRange } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { LabelRef } from "./ast/dtc/labelRef";
import { Label } from "./ast/dtc/label";

function getNode(result: SearchableResult | undefined): Hover | undefined {
  if (result?.item instanceof Node) {
    return {
      contents: result.item.toMarkupContent(),
      range: toRange(result.ast),
    };
  }

  if (result?.ast instanceof NodeName) {
    const node = result.ast.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(),
        range: toRange(result.ast),
      };
    }
  }

  if (result?.ast.parentNode instanceof LabelRef) {
    const node = result.ast.parentNode.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(),
        range: toRange(result.ast),
      };
    }
  }
}

export function getHover(
  hoverParams: HoverParams,
  context: ContextAware[],
  preferredContext?: number
): Promise<(Hover | undefined)[]> {
  return nodeFinder<Hover | undefined>(
    hoverParams,
    context,
    (locationMeta) => [getNode(locationMeta)],
    preferredContext
  );
}
