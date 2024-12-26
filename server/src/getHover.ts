import { Hover, HoverParams, MarkupContent } from "vscode-languageserver";
import { SearchableResult } from "./types";
import { nodeFinder, toRange } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { Node } from "./context/node";
import { NodeName } from "./ast/dtc/node";
import { LabelRef } from "./ast/dtc/labelRef";
import { Label } from "./ast/dtc/label";

function getNode(result: SearchableResult | undefined): Hover | undefined {
  if (result?.item instanceof Node) {
    return {
      contents: result.item.toMarkupContent(),
      range: toRange(result.ast),
    };
  }

  if (result?.ast instanceof NodeName) {
    const node = result.ast.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(),
        range: toRange(result.ast),
      };
    }
  }

  if (result?.ast.parentNode instanceof LabelRef) {
    const node = result.ast.parentNode.linksTo;
    if (node) {
      return {
        contents: node.toMarkupContent(),
        range: toRange(result.ast),
      };
    }
  }
}

export function getHover(
  hoverParams: HoverParams,
  context: ContextAware[],
  preferredContext?: number
): Promise<(Hover | undefined)[]> {
  return nodeFinder<Hover | undefined>(
    hoverParams,
    context,
    (locationMeta) => [getNode(locationMeta)],
    preferredContext
  );
}
