import { DocumentSymbol, SemanticTokensBuilder } from 'vscode-languageserver';
import { Issue, SyntaxIssue, Token } from './types';
import { adjesentTokens } from './helpers';

export abstract class BaseParser {
	positionStack: number[] = [];
	issues: Issue<SyntaxIssue>[] = [];

	constructor(protected tokens: Token[], public readonly uri: string) {}

	get done() {
		return this.peekIndex() >= this.tokens.length;
	}

	protected get moveToNextToken() {
		const token = this.currentToken;
		this.moveStackIndex();
		return token;
	}

	protected enqueToStack() {
		this.positionStack.push(this.peekIndex());
	}

	protected popStack() {
		this.positionStack.pop();
	}

	protected mergeStack() {
		const value = this.positionStack.pop();

		if (value === undefined) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1] = value;
	}

	protected peekIndex(depth = 1) {
		const peek = this.positionStack.at(-1 * depth);
		if (peek === undefined) {
			throw new Error('Index out of bounds');
		}

		return peek;
	}

	protected get currentToken() {
		return this.tokens.at(this.peekIndex());
	}

	protected get prevToken() {
		const index = this.peekIndex() - 1;
		if (index === -1) {
			return;
		}

		return this.tokens[index];
	}

	protected moveStackIndex() {
		if (this.positionStack[this.positionStack.length - 1] === undefined) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1]++;
	}

	protected checkConcurrentTokens(
		cmps: ((token: Token | undefined, index?: number) => 'yes' | 'no' | 'patrial')[]
	) {
		this.enqueToStack();

		const tokens: Token[] = [];

		cmps.every((cmp) => {
			const token = this.currentToken;
			const result = cmp(token);
			let continueLoop = false;

			if (result !== 'no' && token) {
				tokens.push(token);
				this.moveToNextToken;
				continueLoop = adjesentTokens(token, this.currentToken);
			}
			return result === 'yes' && continueLoop;
		});

		this.mergeStack();
		return tokens;
	}

	protected consumeAnyConcurrentTokens(
		cmps: ((token: Token | undefined, index?: number) => 'yes' | 'no' | 'patrial')[]
	) {
		this.enqueToStack();

		const tokens: Token[] = [];

		let token: Token | undefined;
		let continueLoop = true;
		while (cmps.some((cmp) => cmp(this.currentToken) === 'yes' && continueLoop)) {
			tokens.push(this.currentToken!);
			token = this.currentToken;
			this.moveToNextToken;
			continueLoop = adjesentTokens(token, this.currentToken);
		}

		this.mergeStack();
		return tokens;
	}

	abstract getDocumentSymbols(): DocumentSymbol[];
	abstract buildSemanticTokens(tokensBuilder: SemanticTokensBuilder): void;
}
