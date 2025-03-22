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

import { Hover, HoverParams, MarkupKind } from "vscode-languageserver";
import { SearchableResult } from "./types";
import { nodeFinder, toRange } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { LabelRef } from "./ast/dtc/labelRef";
import { Property } from "./context/property";
import { PropertyName } from "./ast/dtc/property";
import { StringValue } from "./ast/dtc/values/string";
import { CIdentifier } from "./ast/cPreprocessors/cIdentifier";
import { ASTBase } from "./ast/base";
import { CMacroCall } from "./ast/cPreprocessors/functionCall";

function getCMacroCall(ast: ASTBase | undefined): CMacroCall | undefined {
  if (!ast || ast instanceof CMacroCall) {
    return ast;
  }
  return getCMacroCall(ast.parentNode);
}

function getMacros(result: SearchableResult | undefined): Hover | undefined {
  if (result?.ast instanceof CIdentifier) {
    const macro = result.runtime.context.parser.cPreprocessorParser.macros.get(
      result.ast.name
    );

    if (macro) {
      const call = getCMacroCall(result.ast);

      if (call) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: [
              "```cpp",
              `#define ${macro.toString()} // = ${call?.evaluate(
                result.runtime.context
              )}`,
              "```",
            ].join("\n"),
          },
          range: toRange(result.ast),
        };
      }

      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: [
            "```cpp",
            `#define ${macro.toString()} // = ${result.ast?.evaluate(
              result.runtime.context
            )}`,
            "```",
          ].join("\n"),
        },
        range: toRange(result.ast),
      };
    }
  }
}

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

  if (
    result?.ast instanceof StringValue &&
    result.item instanceof Property &&
    result.item.parent.name === "aliases"
  ) {
    const node = result.runtime.rootNode.getChild(result.ast.value.split("/"));
    if (node) {
      return {
        contents: node.toMarkupContent(),
        range: toRange(result.ast),
      };
    }
  }
}

function getPropertyName(
  result: SearchableResult | undefined
): Hover | undefined {
  if (result?.item instanceof Property && result.ast instanceof PropertyName) {
    const markup = result.item.parent.nodeType?.getOnPropertyHover(
      result.item.name
    );

    if (markup) {
      return {
        contents: markup,
        range: toRange(result.ast),
      };
    }
  }
}

export function getHover(
  hoverParams: HoverParams,
  context: ContextAware[],
  preferredContext?: string | number
): Promise<(Hover | undefined)[]> {
  return nodeFinder<Hover | undefined>(
    hoverParams,
    context,
    (locationMeta) => [
      getNode(locationMeta) ||
        getPropertyName(locationMeta) ||
        getMacros(locationMeta),
    ],
    preferredContext
  );
}
