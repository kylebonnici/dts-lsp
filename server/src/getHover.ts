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
import { getCMacroCall, nodeFinder, toRange } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { LabelRef } from "./ast/dtc/labelRef";
import { Property } from "./context/property";
import { PropertyName } from "./ast/dtc/property";
import { StringValue } from "./ast/dtc/values/string";
import { CIdentifier } from "./ast/cPreprocessors/cIdentifier";
import { CMacroCallParam } from "./ast/cPreprocessors/functionCall";

async function getMacros(
  result: SearchableResult | undefined
): Promise<Hover | undefined> {
  if (
    result?.ast instanceof CIdentifier ||
    result?.ast instanceof CMacroCallParam
  ) {
    const macro = result.runtime.context.parser.cPreprocessorParser.macros.get(
      result?.ast instanceof CIdentifier ? result.ast.name : result.ast.value
    );

    if (macro) {
      const call = getCMacroCall(result.ast);
      const lastParser = (await result.runtime.context.getAllParsers()).at(-1)!;

      if (call) {
        const val = call?.evaluate(lastParser.cPreprocessorParser.macros);
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: [
              "```cpp",
              `#define ${macro.macro.toString()} // = ${val}${
                typeof val === "number" ? ` (0x${val.toString(16)})` : ""
              }`,
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
            `#define ${macro.macro.toString()} // = ${result.ast?.evaluate(
              lastParser.cPreprocessorParser.macros
            )}`,
            "```",
          ].join("\n"),
        },
        range: toRange(result.ast),
      };
    }
  }
}

async function getNode(
  result: SearchableResult | undefined
): Promise<Hover | undefined> {
  if (!result) {
    return;
  }

  const lastParser = (await result.runtime.context.getAllParsers()).at(-1)!;

  if (result?.ast instanceof NodeName) {
    const node = result.ast.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(lastParser.cPreprocessorParser.macros),
        range: toRange(result.ast),
      };
    }
  }

  if (result?.ast.parentNode instanceof LabelRef) {
    const node = result.ast.parentNode.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(lastParser.cPreprocessorParser.macros),
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
        contents: node.toMarkupContent(lastParser.cPreprocessorParser.macros),
        range: toRange(result.ast),
      };
    }
  }

  if (result?.item instanceof Node) {
    return {
      contents: result.item.toMarkupContent(
        lastParser.cPreprocessorParser.macros
      ),
      range: toRange(result.ast),
    };
  }
}

function getPropertyName(
  result: SearchableResult | undefined
): Hover | undefined {
  if (result?.item instanceof Property && result.ast instanceof PropertyName) {
    const markup_1 = result.item.onHover();

    const markup_2 = result.item.parent.nodeType?.getOnPropertyHover(
      result.item.name
    );

    if (markup_1 || markup_2) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `${markup_1?.value ?? ""}\n${markup_2?.value ?? ""}`,
        },
        range: toRange(result.ast),
      };
    }
  }
}

export function getHover(
  hoverParams: HoverParams,
  context: ContextAware | undefined
): Promise<(Hover | undefined)[]> {
  return nodeFinder<Hover | undefined>(
    hoverParams,
    context,
    async (locationMeta) => [
      (await getNode(locationMeta)) ||
        getPropertyName(locationMeta) ||
        (await getMacros(locationMeta)),
    ]
  );
}
