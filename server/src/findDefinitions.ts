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

import { Location, TextDocumentPositionParams } from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { DtcChildNode, DtcRefNode, NodeName } from "./ast/dtc/node";
import { Label } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { nodeFinder, toRange } from "./helpers";
import { DtcProperty, PropertyName } from "./ast/dtc/property";
import { Property } from "./context/property";
import { DeleteProperty } from "./ast/dtc/deleteProperty";
import { isDeleteChild } from "./ast/helpers";

function getPropertyDefinition(
  result: SearchableResult | undefined
): Location[] {
  if (
    !result ||
    result.item === null ||
    !(result.ast instanceof PropertyName)
  ) {
    return [];
  }

  const getTopProperty = (property: Property): Property => {
    if (property.replacedBy) {
      return getTopProperty(property.replacedBy);
    }

    return property;
  };

  const gentItem = (property: Property) => {
    return [property.ast, ...property.allReplaced.map((p) => p.ast)]
      .map((dtc) => {
        if (dtc instanceof DtcProperty) {
          return Location.create(
            `file://${dtc.uri}`,
            toRange(dtc.propertyName ?? dtc)
          );
        }
      })
      .filter((r) => r) as Location[];
  };

  if (result.item instanceof Property && result.ast instanceof PropertyName) {
    return gentItem(getTopProperty(result.item));
  }

  if (
    result.item instanceof Node &&
    result.ast instanceof PropertyName &&
    result.ast.parentNode instanceof DeleteProperty
  ) {
    const property = result.item.deletedProperties.find(
      (d) => d.by === result.ast.parentNode
    )?.property;
    if (property) return gentItem(property);
  }

  return [];
}

function getNodeDefinition(result: SearchableResult | undefined): Location[] {
  if (
    !result ||
    (!(result.ast instanceof NodeName) && !(result.ast instanceof Label))
  ) {
    return [];
  }

  const gentItem = (node: Node) => {
    return [...node.definitions, ...node.referencedBy]
      .map((dtc) => {
        if (dtc instanceof DtcChildNode) {
          return Location.create(`file://${dtc.uri}`, toRange(dtc));
        }
        if (dtc instanceof DtcRefNode) {
          return Location.create(`file://${dtc.uri}`, toRange(dtc));
        }
      })
      .filter((r) => r) as Location[];
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

export async function getDefinitions(
  location: TextDocumentPositionParams,
  contexts: ContextAware[],
  preferredContext?: number
): Promise<Location[]> {
  return nodeFinder(
    location,
    contexts,
    (locationMeta) => [
      ...getNodeDefinition(locationMeta),
      ...getPropertyDefinition(locationMeta),
    ],
    preferredContext
  );
}
