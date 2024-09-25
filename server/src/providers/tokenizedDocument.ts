import { readFileSync } from 'fs-extra';
import { Token, Disposable } from '../types';
import { Lexer } from '../lexer';

type Callback = (tokens: Token[]) => void;
let tokenizedDocmentProvider: TokenizedDocmentProvider | undefined;

class TokenizedDocmentProvider {
	private fileMap = new Map<string, Lexer>();
	private dependencies = new Map<string, Callback[]>();

	renewLexer(uri: string, text?: string): Token[] {
		text ??= readFileSync(uri).toString();
		const lexer = new Lexer(text);
		this.fileMap.set(uri, lexer);
		this.dependencies.get(uri)?.forEach((c) => c(lexer.tokens));
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
