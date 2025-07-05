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
import { isChildOfAstNode, isDeleteChild } from "./ast/helpers";
import { NodeType } from "./dtsTypes/types";
import { ASTBase } from "./ast/base";
import { PropertyValue } from "./ast/dtc/values/value";
import { DeleteBase } from "./ast/dtc/delete";

const propertyValue = (astBase?: ASTBase): boolean => {
  if (!astBase || astBase instanceof DtcProperty) return false;

  return astBase instanceof PropertyValue || propertyValue(astBase.parentNode);
};

function getPropertyAssignItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(result.item instanceof Property && result.item.ast.assignOperatorToken)
  ) {
    return [];
  }

  const inPropertyValue = propertyValue(result?.ast);

  if (
    !inPropertyValue &&
    !(result.ast instanceof DtcProperty && result.item.ast.values === null) &&
    !propertyValue(result.beforeAst) &&
    !propertyValue(result.afterAst)
  ) {
    return [];
  }

  let valueIndex = -1;

  if (result.item.ast.values === null) {
    valueIndex = 0;
  } else {
    valueIndex =
      (result.item.ast.values?.values.findIndex(
        (v) => v && isChildOfAstNode(v, result.beforeAst)
      ) ?? -1) + 1;
  }

  if (valueIndex === -1) {
    valueIndex = 0;
  }

  const nodeType = result.item.parent.nodeType;
  if (result.item.name === "compatible") {
    const currentBindings = result.item.ast.quickValues;
    let bindings: string[] | undefined;
    if (nodeType instanceof NodeType && nodeType.extends.size) {
      bindings = Array.from(nodeType.extends).filter(
        (v) => !currentBindings || !currentBindings.includes(v)
      );
    }
    bindings ??= result.runtime.context.bindingLoader?.getBindings() ?? [];
    return bindings
      .filter((v) => !currentBindings || !currentBindings.includes(v))
      .map((v) => ({
        label: inPropertyValue ? `${v}` : `"${v}"`,
        kind: CompletionItemKind.Variable,
      }));
  }

  if (nodeType instanceof NodeType) {
    return (
      nodeType.properties
        .find((p) => p.name === result.item?.name)
        ?.getPropertyCompletionItems(
          result.item,
          valueIndex,
          inPropertyValue
        ) ?? []
    );
  }

  return [];
}

function getPropertyNamesItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(
      (result.item instanceof Property &&
        result.ast instanceof PropertyName &&
        result.item.ast.values == null) ||
      result.item instanceof Node
    ) ||
    isDeleteChild(result.ast) ||
    result.beforeAst?.parentNode instanceof DeleteBase
  ) {
    return [];
  }

  const getItems = (node: Node) =>
    node.nodeType?.getPropertyListCompletionItems(node) ?? [];

  if (result.item instanceof Property) {
    return getItems(result.item.parent);
  }

  return getItems(result.item);
}

export async function getTypeCompletions(
  location: TextDocumentPositionParams,
  context: ContextAware | undefined
): Promise<CompletionItem[]> {
  return nodeFinder(location, context, (locationMeta) => [
    ...getPropertyAssignItems(locationMeta),
    ...getPropertyNamesItems(locationMeta),
  ]);
}
