import { readFileSync } from "fs";
import { Token } from "../types";
import { Lexer } from "../lexer";

let tokenizedDocmentProvider: TokenizedDocmentProvider | undefined;

class TokenizedDocmentProvider {
  private fileMap = new Map<string, Lexer>();

  renewLexer(uri: string, text?: string): Token[] {
    text ??= readFileSync(uri).toString();
    const lexer = new Lexer(text);
    this.fileMap.set(uri, lexer);
    return [...lexer.tokens];
  }

  requestTokens(uri: string, renewIfNotFound: boolean): Token[] {
    const tokens = this.fileMap.get(uri)?.tokens;
    if (!tokens && renewIfNotFound) {
      return [...this.renewLexer(uri)];
    }
    return [...(tokens ?? [])];
  }
}

export function getTokenizedDocmentProvider(): TokenizedDocmentProvider {
  tokenizedDocmentProvider ??= new TokenizedDocmentProvider();
  return tokenizedDocmentProvider;
}

export function resetTokenizedDocmentProvider() {
  tokenizedDocmentProvider = new TokenizedDocmentProvider();
}
