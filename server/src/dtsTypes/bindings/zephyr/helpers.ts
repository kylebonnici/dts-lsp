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

import { Runtime } from "src/context/runtime";
import { Node } from "../../../context/node";
import { LabelRef } from "src/ast/dtc/labelRef";
import { NodePathRef } from "src/ast/dtc/values/nodePath";

export const getZephyrMacroPath = (node: Node) =>
  `DT_PATH(${node.path
    .slice(1)
    .map((p) => p.replace("@", "_").replaceAll("-", "_"))
    .join(",")})`;

export const getNodeLabelMacros = (node: Node): string[] =>
  node.labels.map((l) => `DT_NODELABEL(${l.label.toString()})`);

export const getNodeAliasesMacros = (node: Node): string[] => {
  const macros: string[] = [];
  const aliases = Runtime.getNodeFromPath(["aliases"], node.root);

  const properties = aliases?.property.filter((p) => {
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

  properties?.forEach((property) =>
    macros.push(`DT_ALIAS(${property.name.replaceAll("-", "_")})`)
  );

  return macros;
};
