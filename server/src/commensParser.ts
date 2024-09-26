import { DocumentSymbol, SemanticTokensBuilder } from 'vscode-languageserver';
import { LexerToken, Token } from './types';
import { createTokenIndex, validToken } from './helpers';
import { Comment } from './ast/dtc/comment';
import { BaseParser } from './baseParser';
import { ASTBase } from './ast/base';
import { getTokenizedDocmentProvider } from './providers/tokenizedDocument';

export class CommentsParser extends BaseParser {
	comments: Comment[] = [];
	public tokens: Token[] = [];

	constructor(public readonly uri: string) {
		super();
	}

	private cleanUpComments() {
		const tokensUsed: number[] = [];
		for (let i = 0; i < this.tokens.length; i++) {
			const result = CommentsParser.processComments(this.tokens, i);
			if (result) {
				i = result.index;
				tokensUsed.push(...result.tokenUsed);
				this.comments.push(...result.comments);
			}
		}
		tokensUsed.reverse().forEach((i) => this.tokens.splice(i, 1));
	}

	get allAstItems(): ASTBase[] {
		return this.comments;
	}

	protected reset() {
		super.reset();
		this.comments = [];
	}

	public reparse() {
		this.reset();
		return this.parse();
	}

	protected async parse() {
		this.tokens = getTokenizedDocmentProvider().requestTokens(this.uri, true);
		this.cleanUpComments();
	}

	private static processComments(tokens: Token[], index: number) {
		const tokenUsed: number[] = [];

		const move = () => {
			tokenUsed.push(index++);
			return tokens[index];
		};

		const currentToken = () => {
			return tokens[index];
		};

		const prevToken = () => {
			return tokens[index - 1];
		};

		const firstToken = currentToken();
		let token = firstToken;
		if (!firstToken || !validToken(firstToken, LexerToken.FORWARD_SLASH)) {
			return;
		}

		token = move();

		if (
			!validToken(token, LexerToken.MULTI_OPERATOR) ||
			firstToken.pos.line !== token.pos.line ||
			firstToken.pos.col + 1 !== token.pos.col
		) {
			return;
		}

		const isEndComment = (): boolean => {
			if (!validToken(prevToken(), LexerToken.MULTI_OPERATOR)) {
				return false;
			}

			if (
				!validToken(currentToken(), LexerToken.FORWARD_SLASH) ||
				prevToken()?.pos.line !== currentToken()?.pos.line ||
				prevToken()?.pos.col + 1 !== currentToken()?.pos.col
			) {
				return false;
			}

			return true;
		};

		// we have a comment start
		let lastLine = token.pos.line;
		let start = firstToken;
		const comments: Comment[] = [];
		token = move();
		do {
			if (currentToken()?.pos.line !== lastLine) {
				const node = new Comment(createTokenIndex(start, prevToken()));
				comments.push(node);

				lastLine = currentToken().pos.line ?? 0;

				start = currentToken();
			}
			token = move();
		} while (index < tokens.length && !isEndComment());

		const node = new Comment(createTokenIndex(start, currentToken()));
		comments.push(node);

		move();
		return {
			comments,
			tokenUsed,
			index: index - 1,
		};
	}
}
