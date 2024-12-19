import { ASTBase } from "../base";
import { Keyword } from "../keyword";
import { SymbolKind } from "vscode-languageserver";

export class DeleteBase extends ASTBase {
  constructor(name: string, public readonly keyword: Keyword) {
    super();
    this.addChild(keyword);
    this.docSymbolsMeta = {
      name,
      kind: SymbolKind.Function,
    };
  }
}
