import { Keyword } from "../keyword";
import { NodeName } from "./node";
import { LabelRef } from "./labelRef";
import { DeleteBase } from "./delete";
import { NodePathRef } from "./values/nodePath";

export class DeleteNode extends DeleteBase {
  private _nodeNameOrRef: NodeName | LabelRef | NodePathRef | null = null;

  constructor(keyword: Keyword) {
    super("Delete Node", keyword);
  }

  set nodeNameOrRef(nodeNameOrRef: NodeName | LabelRef | NodePathRef | null) {
    if (this._nodeNameOrRef)
      throw new Error("Only one property name is allowed");
    this._nodeNameOrRef = nodeNameOrRef;
    this.addChild(nodeNameOrRef);
  }

  get nodeNameOrRef() {
    return this._nodeNameOrRef;
  }
}
