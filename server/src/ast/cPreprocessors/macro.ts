import { CIdentifier } from "./cIdentifier";
import { FunctionDefinition } from "./functionDefinition";
import { Keyword } from "../keyword";
import { ASTBase } from "../base";
import { LexerToken, Token, TokenIndexes } from "../../types";
import { validToken } from "../../../src/helpers";

export class CMacroContent extends ASTBase {
  constructor(tokenIndexes: TokenIndexes, public readonly content: Token[]) {
    super(tokenIndexes);
  }

  toString() {
    const allDataTokens = this.content.filter(
      (t) => !validToken(t, LexerToken.BACK_SLASH)
    );

    return allDataTokens
      .map((p, i) => {
        let v = p.value;
        if (p.pos.line === allDataTokens.at(i + 1)?.pos.line) {
          v = v.padEnd(allDataTokens[i + 1].pos.col - p.pos.col, " ");
        } else if (allDataTokens.at(i + 1)) {
          v = v.padEnd(v.length + 1, " ");
        }
        return v;
      })
      .join("");
  }
}

export class CMacro extends ASTBase {
  constructor(
    public readonly keyword: Keyword,
    public readonly identifier: CIdentifier | FunctionDefinition,
    public readonly content?: CMacroContent
  ) {
    super();
    this.addChild(keyword);
    this.addChild(this.identifier);
    if (this.content) {
      this.addChild(this.content);
    }
  }

  get name() {
    return this.identifier instanceof CIdentifier
      ? this.identifier.name
      : this.identifier.functionName.name;
  }

  toString() {
    return [
      this.identifier.toString(),
      ...(this.content ? [this.content?.toString()] : []),
    ].join(" ");
  }
}
