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
import { DtcChildNode, DtcRootNode, NodeName } from "./ast/dtc/node";
import { Label } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { nodeFinder, pathToFileURL, toRange } from "./helpers";
import { DtcProperty, PropertyName } from "./ast/dtc/property";
import { Property } from "./context/property";
import { DeleteProperty } from "./ast/dtc/deleteProperty";
import { isDeleteChild } from "./ast/helpers";
import { StringValue } from "./ast/dtc/values/string";

function getPropertyReferences(
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
    return [
      property.ast,
      ...property.allReplaced.map((p) => p.ast),
      ...[
        property.parent.deletedProperties.find((p) => (p.property = property))
          ?.by ?? [],
      ],
    ]
      .map((dtc) => {
        if (dtc instanceof DtcProperty) {
          return Location.create(
            pathToFileURL(dtc.uri),
            toRange(dtc.propertyName ?? dtc)
          );
        }
        if (dtc instanceof DeleteProperty) {
          return Location.create(
            pathToFileURL(dtc.uri),
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

function getNodeReferences(result: SearchableResult | undefined): Location[] {
  if (!result) {
    return [];
  }

  const gentItem = (node: Node) => {
    const aliases = result.runtime.rootNode.getNode("aliases");
    const aliaseProperties =
      aliases?.property
        .filter((p) => {
          const values = p.ast.quickValues;
          if (values?.length === 1 && typeof values[0] === "string") {
            if (
              result.runtime.rootNode.getChild(values[0].split("/")) === node
            ) {
              return true;
            }
          }
        })
        .map((p) => p.ast) ?? [];

    const deleteNodes =
      node.parent?.deletedNodes
        .filter(
          (n) =>
            n.node === node &&
            (n.by.nodeNameOrRef instanceof NodeName
              ? n.by.nodeNameOrRef !== result.ast
              : !node.linkedRefLabels.some((r) => r !== result.ast))
        )
        .map((n) => n.by.nodeNameOrRef) ?? [];
    return [
      ...aliaseProperties,
      ...node.linkedRefLabels,
      ...node.linkedNodeNamePaths,
      ...node.definitions,
      ...deleteNodes,
    ]
      .map((dtc) => {
        if (dtc instanceof DtcRootNode) {
          return Location.create(
            pathToFileURL(dtc.uri),
            toRange(dtc.name ?? dtc)
          );
        }
        if (dtc instanceof DtcChildNode) {
          return Location.create(
            pathToFileURL(dtc.uri),
            toRange(dtc.name ?? dtc)
          );
        }
        if (dtc instanceof NodeName) {
          return Location.create(pathToFileURL(dtc.uri), toRange(dtc));
        }
        if (dtc instanceof NodeName) {
          return Location.create(pathToFileURL(dtc.uri), toRange(dtc));
        }
        if (dtc instanceof LabelRef) {
          return Location.create(
            pathToFileURL(dtc.uri),
            toRange(dtc.label ?? dtc)
          );
        }
        if (dtc instanceof DtcProperty) {
          return Location.create(
            pathToFileURL((dtc.values ?? dtc)?.uri),
            toRange(dtc.values ?? dtc)
          );
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
      if (isDeleteChild(result.ast)) {
        return [
          ...gentItem(result.ast.linksTo),
          Location.create(pathToFileURL(result.ast.uri), toRange(result.ast)),
        ];
      }

      return gentItem(result.ast.linksTo);
    }
  }

  if (
    result?.ast instanceof StringValue &&
    result.item instanceof Property &&
    result.item.parent.name === "aliases"
  ) {
    const node = result.runtime.rootNode.getChild(result.ast.value.split("/"));
    if (node) {
      return gentItem(node);
    }
  }

  return [];
}

export async function getReferences(
  location: TextDocumentPositionParams,
  context: ContextAware | undefined
): Promise<Location[]> {
  return nodeFinder(location, context, (locationMeta) => [
    ...getNodeReferences(locationMeta),
    ...getPropertyReferences(locationMeta),
  ]);
}
