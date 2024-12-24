import { SymbolKind } from "vscode-languageserver";
import { Expression } from "../../cPreprocessors/expression";
import { TokenIndexes } from "../../../types";

export class NumberValue extends Expression {
  constructor(public readonly value: number, tokenIndexes: TokenIndexes) {
    super(tokenIndexes);
    this.docSymbolsMeta = {
      name: this.value.toString(),
      kind: SymbolKind.Number,
    };
    this.semanticTokenType = "number";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return this.value.toString();
  }
}
