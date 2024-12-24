import { ASTBase } from "../base";
import { TokenIndexes } from "../../types";

export class Comment extends ASTBase {
  constructor(tokenIndexes: TokenIndexes) {
    super(tokenIndexes);
    this.semanticTokenType = "comment";
    this.semanticTokenModifiers = "documentation";
  }
}
