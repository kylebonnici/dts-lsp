/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { TextDocumentPositionParams } from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { nodeFinder } from "./helpers";
import { Property } from "./context/property";
import { Actions } from "./types/index";
import { LabelRef } from "./ast/dtc/labelRef";
import { NodeName } from "./ast/dtc/node";
import { PropertyName } from "./ast/dtc/property";
import {
  getNodeAliasesMacros,
  getNodeLabelMacros,
  getPropertyWithNodeLabel,
  getPropertyWithNodePath,
  getZephyrMacroPath,
} from "./dtsTypes/bindings/zephyr/helpers";

function getPropertyActions(
  result: SearchableResult | undefined,
  context: ContextAware
): Actions[] {
  if (
    !result ||
    !(result.item instanceof Property) ||
    !(result.ast instanceof PropertyName)
  ) {
    return [];
  }

  const actions: Actions[] = [];
  if (context.settings.bindingType === "Zephyr") {
    actions.push({
      type: "dt_zephyr_macro_prop_node_path",
      data: getPropertyWithNodePath(result.item),
    });

    const prop = result.item;
    getPropertyWithNodeLabel(result.item).forEach((macro) => {
      actions.push({
        type: "dt_zephyr_macro_prop_node_label",
        data: macro,
      });
    });
  }

  return actions;
}

function getNodeActions(
  result: SearchableResult | undefined,
  context: ContextAware
): Actions[] {
  if (!result || result.item === null) {
    return [];
  }

  let node: Node | undefined;
  if (result.item instanceof Node) {
    node = result.item;
  } else if (
    result.ast.parentNode instanceof LabelRef &&
    result.ast.parentNode.linksTo
  ) {
    node = result.ast.parentNode.linksTo;
  } else if (result.ast instanceof NodeName && result.ast.linksTo) {
    node = result.ast.linksTo;
  }

  if (!node) return [];

  const actions: Actions[] = [
    {
      type: "path",
      data: node.pathString,
    },
  ];

  if (context.settings.bindingType === "Zephyr") {
    getNodeLabelMacros(node).forEach((macro) => {
      actions.push({
        type: "dt_zephyr_macro_node_label",
        data: macro,
      });
    });

    actions.push({
      type: "dt_zephyr_macro_node_path",
      data: getZephyrMacroPath(node),
    });

    getNodeAliasesMacros(node).forEach((macro) => {
      actions.push({
        type: "dt_zephyr_macro_prop_node_alias",
        data: macro,
      });
    });
  }

  return actions;
}

export async function getActions(
  location: TextDocumentPositionParams,
  context: ContextAware | undefined
): Promise<Actions[]> {
  if (!context) return [];

  return nodeFinder(location, context, (locationMeta) => [
    ...getNodeActions(locationMeta, context),
    ...getPropertyActions(locationMeta, context),
  ]);
}
