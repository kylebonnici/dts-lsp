import { ASTBase } from "../../base";
import { SymbolKind } from "vscode-languageserver";
import { LabelAssign } from "../label";
import { PropertyValue } from "./value";

export class PropertyValues extends ASTBase {
  constructor(
    public readonly values: (PropertyValue | null)[],
    public readonly labels: LabelAssign[]
  ) {
    super();
    this.docSymbolsMeta = {
      name: "Values",
      kind: SymbolKind.String,
    };
    this.labels.forEach((label) => {
      this.addChild(label);
    });
    this.values.forEach((value) => this.addChild(value));
  }
}
