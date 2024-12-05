import { Keyword } from "../keyword";
import { PropertyName } from "./property";
import { DeleteBase } from "./delete";

export class DeleteProperty extends DeleteBase {
  private _propertyName: PropertyName | null = null;

  constructor(keyword: Keyword) {
    super("Delete Property", keyword);
  }

  set propertyName(propertyName: PropertyName | null) {
    if (this._propertyName)
      throw new Error("Only only property name is allowed");
    this._propertyName = propertyName;
    this.addChild(propertyName);
  }

  get propertyName() {
    return this._propertyName;
  }
}
