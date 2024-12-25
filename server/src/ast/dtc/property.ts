import { TokenIndexes } from "../../types";
import { ASTBase } from "../base";
import { SymbolKind } from "vscode-languageserver";
import { LabelAssign } from "./label";
import { PropertyValues } from "./values/values";

export class PropertyName extends ASTBase {
  constructor(public readonly name: string, tokenIndex: TokenIndexes) {
    super(tokenIndex);
    this.semanticTokenType = "property";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return this.name;
  }
}

export class DtcProperty extends ASTBase {
  private _values: PropertyValues | null = null;

  constructor(
    public readonly propertyName: PropertyName | null,
    public readonly labels: LabelAssign[] = []
  ) {
    super();
    this.docSymbolsMeta = {
      name: this.propertyName?.name ?? "Unknown",
      kind: SymbolKind.Property,
    };
    this.labels.forEach((label) => this.addChild(label));
    this.addChild(propertyName);
  }

  set values(values: PropertyValues | null) {
    if (this._values) throw new Error("Only on property name is allowed");
    this._values = values;
    this.addChild(values);
  }

  get values() {
    return this._values;
  }

  toString() {
    return `${this.propertyName?.toString() ?? "__UNSET__"}${
      this._values?.values.length
        ? ` = ${this._values.values
            .map((v) => v?.toString() ?? "NULL")
            .join(", ")}`
        : ""
    }`;
  }
}
