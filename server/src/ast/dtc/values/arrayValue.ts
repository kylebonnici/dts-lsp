import { ASTBase } from "../../base";
import { SymbolKind } from "vscode-languageserver";
import { LabelRef } from "../labelRef";
import { NodePathRef } from "./nodePath";
import { NumberValue } from "./number";
import { LabeledValue } from "./labeledValue";
import { Expression } from "../../cPreprocessors/expression";

export class ArrayValues extends ASTBase {
  constructor(
    public readonly values: LabeledValue<
      NumberValue | LabelRef | NodePathRef | Expression
    >[]
  ) {
    super();
    this.docSymbolsMeta = {
      name: "Cell Array",
      kind: SymbolKind.Array,
    };
    this.values.forEach((value) => this.addChild(value));
  }

  toString() {
    return `<${this.values.map((v) => v.toString()).join(" ")}>`;
  }
}
