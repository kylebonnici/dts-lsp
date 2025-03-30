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
  PrepareRenameParams,
  RenameParams,
  TextEdit,
  WorkspaceEdit,
} from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { DtcChildNode, NodeName } from "./ast/dtc/node";
import { Label, LabelAssign } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { nodeFinder, toRange } from "./helpers";
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
        if (
          (dtc instanceof DtcProperty || dtc instanceof DeleteProperty) &&
          dtc.propertyName
        ) {
          return Location.create(
            `file://${dtc.uri}`,
            toRange(dtc.propertyName)
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

function getNodeLabelRename(
  location: RenameParams | PrepareRenameParams,
  result: SearchableResult | undefined
): Location[] {
  if (!result || !(result.ast instanceof Label)) {
    return [];
  }

  if ("newName" in location) {
    if (
      result.ast.parentNode instanceof LabelRef &&
      location.newName.startsWith("&")
    ) {
      location.newName = location.newName.slice(1);
    } else if (
      result.ast.parentNode instanceof LabelAssign &&
      location.newName.endsWith(":")
    ) {
      location.newName = location.newName.slice(0, -1);
    }
  }

  const labelValue = result.ast.value;

  const gentItem = (node: Node) => {
    return [
      ...(
        node.definitions.filter(
          (d) => d instanceof DtcChildNode
        ) as DtcChildNode[]
      ).flatMap((d) => d.labels.map((l) => l.label)),
      ...node.linkedRefLabels.map((l) => l.label),
    ]
      .filter((l) => l?.value === labelValue)
      .map((dtc) => {
        if (dtc) {
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

  return [];
}

function getNodeNameRename(result: SearchableResult | undefined): Location[] {
  if (!result || !(result.ast instanceof NodeName)) {
    return [];
  }

  const gentItem = (node: Node) => {
    const aliases = result.runtime.rootNode.getNode("aliases");
    const aliaseProperties =
      aliases?.property
        .filter((p) => {
          const values = p.ast.quickValues;
          if (values?.length === 1 && typeof values[0] === "string") {
            const childNode = result.runtime.rootNode.getChild(
              values[0].split("/")
            );
            if (childNode?.isChildOf(node) || childNode === node) {
              return true;
            }
          }
        })
        .map((p) => p.ast) ?? [];

    const deleteNodes =
      node.parent?.deletedNodes
        .filter((n) => n.node === node && n.by.nodeNameOrRef !== result.ast)
        .map((n) => n.by.nodeNameOrRef) ?? [];
    return [
      ...aliaseProperties,
      ...node.linkedNodeNamePaths,
      ...node.definitions,
      ...deleteNodes,
    ]
      .map((dtc) => {
        if (dtc instanceof DtcChildNode && dtc.name) {
          return Location.create(`file://${dtc.uri}`, toRange(dtc.name));
        }
        if (dtc instanceof NodeName) {
          return Location.create(`file://${dtc.uri}`, toRange(dtc));
        }
        if (
          dtc instanceof DtcProperty &&
          dtc.values?.values[0]?.value &&
          dtc.values?.values[0]?.value instanceof StringValue
        ) {
          const v = dtc.values.values[0].value;
          const strRange = toRange(v);
          const aliasPath = v.value.split("/");
          const nodePath = node.path;
          const startOfset =
            aliasPath.slice(0, nodePath.length - 1).join("/").length + 1;

          const endOfset =
            v.value.length -
            aliasPath.slice(0, nodePath.length).join("/").length;

          strRange.start.character += 1 + startOfset;
          strRange.end.character -= 1 + endOfset;

          return Location.create(
            `file://${dtc.values.values[0].uri}`,
            strRange
          );
        }
      })
      .filter((r) => r) as Location[];
  };

  if (result.item instanceof Node && !isDeleteChild(result.ast)) {
    return gentItem(result.item);
  }

  if (result.ast instanceof NodeName) {
    if (result.ast.linksTo) {
      if (isDeleteChild(result.ast)) {
        return [
          ...gentItem(result.ast.linksTo),
          Location.create(`file://${result.ast.uri}`, toRange(result.ast)),
        ];
      }

      return gentItem(result.ast.linksTo);
    }
  }

  return [];
}

export async function getRenameRequest(
  location: RenameParams,
  contexts: ContextAware[],
  activeContext?: ContextAware,
  preferredContext?: string | number
): Promise<WorkspaceEdit> {
  const changes: { [uri: string]: TextEdit[] } = {};

  const locationResult = await nodeFinder(
    location,
    contexts,
    (locationMeta) => [
      ...getNodeNameRename(locationMeta),
      ...getNodeLabelRename(location, locationMeta),
      ...getPropertyReferences(locationMeta),
    ],
    activeContext,
    preferredContext
  );

  locationResult.forEach((editLocation) => {
    changes[editLocation.uri] ??= [];
    changes[editLocation.uri].push(
      TextEdit.replace(editLocation.range, location.newName)
    );
  });

  return {
    changes,
  };
}

export async function getPrepareRenameRequest(
  location: PrepareRenameParams,
  contexts: ContextAware[],
  lockRenameEdits: string[],
  activeContext?: ContextAware,
  preferredContext?: string | number
): Promise<{
  defaultBehavior: boolean;
}> {
  const locationResult = await nodeFinder(
    location,
    contexts,
    (locationMeta) => [
      ...getNodeNameRename(locationMeta),
      ...getNodeLabelRename(location, locationMeta),
      ...getPropertyReferences(locationMeta),
    ],
    activeContext,
    preferredContext
  );

  if (
    locationResult.some((r) =>
      lockRenameEdits.some((l) => r.uri.replace("file://", "").startsWith(l))
    )
  ) {
    throw new Error('Path is locked by user setting "lockRenameEdits"');
  }

  return { defaultBehavior: !!locationResult.length };
}
