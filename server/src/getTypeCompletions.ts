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
  CompletionItem,
  CompletionItemKind,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { DtcProperty, PropertyName } from "./ast/dtc/property";
import { Property } from "./context/property";
import { nodeFinder } from "./helpers";
import { isDeleteChild } from "./ast/helpers";

function getPropertyAssignItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(result.item instanceof Property) ||
    !(
      result.ast instanceof DtcProperty &&
      (result.ast.values || result.ast.values === null)
    )
  ) {
    return [];
  }

  return (
    result.item.parent.nodeType?.properties
      .find((p) => p.name === result.item?.name)
      ?.getPropertyCompletionItems(result.item) ?? []
  );
}

function getPropertyNamesItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(
      (result.item instanceof Property &&
        result.ast instanceof PropertyName &&
        result.item.ast.values === null) ||
      result.item instanceof Node
    ) ||
    isDeleteChild(result.ast)
  ) {
    return [];
  }

  const getItems = (node: Node) => {
    return (
      node.nodeType?.properties
        .filter(
          (p) =>
            !p.hideAutoComplete &&
            p.required(node) !== "omitted" &&
            typeof p.name === "string"
        )
        .map((p) => {
          const required = node && p.required(node);
          const hasProperty = !!node.properties.some((pp) =>
            p.getNameMatch(pp.name)
          );
          let sortLetter = "a";
          if (required) {
            sortLetter = hasProperty ? "Y" : "A";
          } else {
            sortLetter = hasProperty ? "Z" : "B";
          }

          return {
            label: `${p.name}`,
            kind: CompletionItemKind.Property,
            sortText: `${sortLetter}${p.name}`,
          };
        }) ?? []
    );
  };

  if (result.item instanceof Property) {
    return getItems(result.item.parent);
  }

  return getItems(result.item);
}

export async function getTypeCompletions(
  location: TextDocumentPositionParams,
  context: ContextAware[],
  preferredContext?: number
): Promise<CompletionItem[]> {
  return nodeFinder(
    location,
    context,
    (locationMeta) => [
      ...getPropertyAssignItems(locationMeta),
      ...getPropertyNamesItems(locationMeta),
    ],
    preferredContext
  );
}
