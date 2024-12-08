import { DocumentSymbol, SymbolKind } from "vscode-languageserver";
import { CIdentifier } from "./cIdentifier";
import { Expression } from "./expression";
import { toRange } from "../../helpers";
import { TokenIndexes } from "src/types";

export class CMacroCallParam extends Expression {
  constructor(
    public readonly value: string,
    tokenIndexes: TokenIndexes,
    index: number
  ) {
    super(tokenIndexes);
    this.docSymbolsMeta = {
      name: `param${index + 1}`,
      kind: SymbolKind.Variable,
    };
    this.semanticTokenType = "variable";
    this.semanticTokenModifiers = "declaration";
  }
}

export class CMacroCall extends Expression {
  constructor(
    public readonly functionName: CIdentifier,
    public readonly params: CMacroCallParam[]
  ) {
    super();
    this.addChild(functionName);
    this.params.forEach((p) => this.addChild(p));
  }

  getDocumentSymbols(): DocumentSymbol[] {
    return [
      {
        name: this.functionName.name,
        kind: SymbolKind.Function,
        range: toRange(this),
        selectionRange: toRange(this),
        children: this.params.flatMap((p) => p.getDocumentSymbols()),
      },
    ];
  }

  toString() {
    return `${this.functionName.toString()}(${this.params
      .map((p) => p.toString())
      .join(",")})`;
  }
}
