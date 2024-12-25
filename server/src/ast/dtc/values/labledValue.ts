import { ASTBase } from "../../base";
import { LabelAssign } from "../label";

export class LabledValue<T extends ASTBase> extends ASTBase {
  constructor(
    public readonly value: T | null,
    public readonly labels: LabelAssign[]
  ) {
    super();
    this.labels.forEach((label) => {
      this.addChild(label);
    });
    this.addChild(this.value);
  }

  toString() {
    return `${this.labels.map((l) => l.toString()).join(" ")}${
      this.value?.toString() ?? "NULL"
    }`;
  }
}
