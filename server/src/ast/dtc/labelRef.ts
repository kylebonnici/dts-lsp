import { ASTBase } from "../base";
import { SymbolKind } from "vscode-languageserver";
import { Label } from "./label";
import { type Node } from "../../context/node";

export class LabelRef extends ASTBase {
  public linksTo?: Node;

  constructor(public readonly label: Label | null) {
    super();
    this.docSymbolsMeta = {
      name: `&${this.label?.value ?? "NULL"}`,
      kind: SymbolKind.Key,
    };
    this.addChild(label);
  }

  get value() {
    return this.label?.value;
  }

  toString() {
    return `&${this.label?.value ?? "NULL"}`;
  }
}
