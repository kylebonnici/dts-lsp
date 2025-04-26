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
import { Runtime } from "./context/runtime";
import { LabelRef } from "./ast/dtc/labelRef";
import { NodePathRef } from "./ast/dtc/values/nodePath";
import { NodeName } from "./ast/dtc/node";
import { PropertyName } from "./ast/dtc/property";

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
      data: `DT_PROP(${getZephyrMacroPath(
        result.item.parent
      )}, ${result.item.name.replaceAll("-", "_")}))`,
    });

    const prop = result.item;
    result.item.parent.labels.forEach((l) =>
      actions.push({
        type: "dt_zephyr_macro_prop_node_label",
        data: `DT_PROP(DT_NODELABEL(${l.label.toString()}), ${prop.name.replaceAll(
          "-",
          "_"
        )})`,
      })
    );
  }

  return actions;
}

const getZephyrMacroPath = (node: Node) =>
  `DT_PATH(${node.path
    .slice(1)
    .map((p) => p.replace("@", "_").replaceAll("-", "_"))
    .join(",")})`;

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
    node.labels.forEach((l) => {
      actions.push({
        type: "dt_zephyr_macro_node_label",
        data: `DT_NODELABEL(${l.label.toString()})`,
      });
    });

    actions.push({
      type: "dt_zephyr_macro_node_path",
      data: getZephyrMacroPath(node),
    });

    const aliases = Runtime.getNodeFromPath(["aliases"], node.root);

    const property = aliases?.property.find((p) => {
      if (p.ast.quickValues?.at(0) === node.pathString) return true;
      const value = p.ast.values?.values.at(0)?.value;

      if (value instanceof LabelRef && value.linksTo === node) {
        return true;
      }

      if (
        value instanceof NodePathRef &&
        value.path?.pathParts.at(-1)?.linksTo === node
      ) {
        return true;
      }
    });
    if (property) {
      actions.push({
        type: "dt_zephyr_macro_prop_node_alias",
        data: `DT_ALIAS(${property.name.replaceAll("-", "_")})`,
      });
    }
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
