import { Location, TextDocumentPositionParams } from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { Label, LabelAssign } from "./ast/dtc/label";
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
    (!(result.ast instanceof NodeName) &&
      !(result.ast instanceof LabelAssign) &&
      !(result.ast instanceof Label))
  ) {
    return;
  }

  const gentItem = (node: Node) => {
    const declaration = node.definitons.at(0);
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
  contexts: ContextAware[]
): Promise<Location | undefined> {
  return (
    await nodeFinder(location, contexts, (locationMeta) => [
      getNodeDeclaration(locationMeta) || getPropertyDeclaration(locationMeta),
    ])
  ).at(0);
}
