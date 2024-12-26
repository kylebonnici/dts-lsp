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
import { isDeleteChild } from "./ast/helpers";

function getPropertyAssignItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(result.item instanceof Property) ||
    !(result.ast instanceof DtcProperty)
  ) {
    return [];
  }

  return (
    result.item.parent.nodeType.properties
      .find((p) => p.name === result.item?.name)
      ?.getPropertyCompletionItems(result.item) ?? []
  );
}

function getPropertyNamesItems(
  result: SearchableResult | undefined
): CompletionItem[] {
  if (
    !result ||
    !(
      (result.item instanceof Property &&
        result.ast instanceof PropertyName &&
        result.item.ast.values === null) ||
      result.item instanceof Node
    ) ||
    isDeleteChild(result.ast)
  ) {
    return [];
  }

  const getItems = (node: Node) => {
    return node.nodeType.properties
      .filter((p) => !p.hideAutoComplete && p.required(node) !== "omitted")
      .map((p) => {
        const required = node && p.required(node);
        const hasProperty = !!node.properties.some((pp) =>
          p.getNameMatch(pp.name)
        );
        let sortLetter = "a";
        if (required) {
          sortLetter = hasProperty ? "Y" : "A";
        } else {
          sortLetter = hasProperty ? "Z" : "B";
        }

        return {
          label: `${p.name}`,
          kind: CompletionItemKind.Property,
          sortText: `${sortLetter}${p.name}`,
        };
      });
  };

  if (result.item instanceof Property) {
    return getItems(result.item.parent);
  }

  return getItems(result.item);
}

export async function getTypeCompletions(
  location: TextDocumentPositionParams,
  context: ContextAware[],
  preferredContext?: number
): Promise<CompletionItem[]> {
  return nodeFinder(
    location,
    context,
    (locationMeta) => [
      ...getPropertyAssignItems(locationMeta),
      ...getPropertyNamesItems(locationMeta),
    ],
    preferredContext
  );
}
