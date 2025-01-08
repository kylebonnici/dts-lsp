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
import { NodeName } from "./ast/dtc/node";
import { Label } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { PropertyName } from "./ast/dtc/property";
import { Property } from "./context/property";
import { DeleteProperty } from "./ast/dtc/deleteProperty";
import { isDeleteChild } from "./ast/helpers";
import { nodeFinder, toRange } from "./helpers";

function getPropertyDeclaration(
  result: SearchableResult | undefined
): Location | undefined {
  if (
    !result ||
    result.item === null ||
    !(result.ast instanceof PropertyName)
  ) {
    return;
  }

  const getBottomProperty = (property: Property): Property => {
    if (property.replaces) {
      return getBottomProperty(property.replaces);
    }

    return property;
  };

  const gentItem = (property: Property) => {
    return Location.create(
      `file://${property.ast.uri}`,
      toRange(property.ast.propertyName ?? property.ast)
    );
  };

  if (result.item instanceof Property && result.ast instanceof PropertyName) {
    return gentItem(getBottomProperty(result.item));
  }

  if (
    result.item instanceof Node &&
    result.ast instanceof PropertyName &&
    result.ast.parentNode instanceof DeleteProperty
  ) {
    const property = result.item.deletedProperties.find(
      (d) => d.by === result.ast.parentNode
    )?.property;
    if (property) return gentItem(getBottomProperty(property));
  }
}

function getNodeDeclaration(
  result: SearchableResult | undefined
): Location | undefined {
  if (
    !result ||
    (!(result.ast instanceof NodeName) && !(result.ast instanceof Label))
  ) {
    return;
  }

  const gentItem = (node: Node) => {
    const declaration = node.definitions.at(0);
    return declaration
      ? Location.create(`file://${declaration.uri}`, toRange(declaration))
      : undefined;
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
}

export async function getDeclaration(
  location: TextDocumentPositionParams,
  contexts: ContextAware[],
  preferredContext?: string | number
): Promise<Location | undefined> {
  return (
    await nodeFinder(
      location,
      contexts,
      (locationMeta) => [
        getNodeDeclaration(locationMeta) ||
          getPropertyDeclaration(locationMeta),
      ],
      preferredContext
    )
  ).at(0);
}
