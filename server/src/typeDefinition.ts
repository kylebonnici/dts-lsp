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
  Location,
  Position,
  Range,
  TypeDefinitionParams,
} from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { Label } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { nodeFinder, pathToFileURL } from "./helpers";
import { isDeleteChild } from "./ast/helpers";

function getNodeTypeDefinition(
  result: SearchableResult | undefined
): Location[] {
  if (
    !result ||
    (!(result.ast instanceof NodeName) && !(result.ast instanceof Label))
  ) {
    return [];
  }

  const gentItem = (node: Node) => {
    if (!node.nodeType?.bindingsPath) {
      return [];
    }
    return [
      Location.create(
        pathToFileURL(node.nodeType.bindingsPath),
        Range.create(Position.create(0, 0), Position.create(0, 0))
      ),
    ];
  };
  if (result.item instanceof Node && !isDeleteChild(result.ast)) {
    return gentItem(result.item);
  }

  if (
    result.ast instanceof Label &&
    result.ast.parentNode instanceof LabelRef
  ) {
    if (result.ast.parentNode.linksTo) {
      return gentItem(result.ast.parentNode.linksTo);
    }
  }

  if (result.ast instanceof NodeName) {
    if (result.ast.linksTo) {
      return gentItem(result.ast.linksTo);
    }
  }

  return [];
}

export async function typeDefinition(
  location: TypeDefinitionParams,
  contexts: ContextAware[],
  activeContext?: ContextAware,
  preferredContext?: number
): Promise<Location[]> {
  return nodeFinder(
    location,
    contexts,
    (locationMeta) => [...getNodeTypeDefinition(locationMeta)],
    activeContext,
    preferredContext
  );
}
