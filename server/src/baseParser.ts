import { DocumentSymbol, SemanticTokensBuilder } from 'vscode-languageserver';
import { Issue, SyntaxIssue, Token, TokenIndexes } from './types';
import { adjesentTokens } from './helpers';
import { ASTBase } from './ast/base';
import { Parser } from './parser';

export abstract class BaseParser {
	positionStack: number[] = [];
	issues: Issue<SyntaxIssue>[] = [];
	childParsers: Parser[] = [];

	protected parsing: Promise<void>;

	public abstract get uri(): string;
	public abstract get tokens(): Token[];
	protected abstract parse(): Promise<void>;
	public abstract reparse(): Promise<void>;

	constructor() {
		this.parsing = new Promise<void>((resolve) => {
			setTimeout(() => {
				this.parse().then(resolve);
			});
		});
	}

	protected reset() {
		this.positionStack = [];
		this.issues = [];
		this.childParsers = [];
	}

	get orderedParsers(): Parser[] {
		return (
			this instanceof Parser
				? [this, ...this.cPreprocessorParser.orderedParsers]
				: this.childParsers.flatMap((p) => p.orderedParsers)
		).reverse();
	}

	get stable() {
		return this.parsing;
	}

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

	abstract get allAstItems(): ASTBase[];

	getDocumentSymbols(): DocumentSymbol[] {
		return this.allAstItems.flatMap((o) => o.getDocumentSymbols());
	}

	buildSemanticTokens(tokensBuilder: SemanticTokensBuilder) {
		const result: {
			line: number;
			char: number;
			length: number;
			tokenType: number;
			tokenModifiers: number;
		}[] = [];
		const push = (
			tokenType: number,
			tokenModifiers: number,
			tokenIndexes?: TokenIndexes
		) => {
			if (!tokenIndexes?.start || !tokenIndexes?.end) return;

			const lengthEnd =
				tokenIndexes.end.pos.col - tokenIndexes.start.pos.col + tokenIndexes.end.pos.len;
			result.push({
				line: tokenIndexes.start.pos.line,
				char: tokenIndexes.start.pos.col,
				length:
					tokenIndexes.end === tokenIndexes.start ? tokenIndexes.end.pos.len : lengthEnd,
				tokenType,
				tokenModifiers,
			});
		};

		this.allAstItems.forEach((a) => a.buildSemanticTokens(push));

		result
			.sort((a, b) => (a.line === b.line ? a.char - b.char : a.line - b.line))
			.forEach((r) =>
				tokensBuilder.push(r.line, r.char, r.length, r.tokenType, r.tokenModifiers)
			);
	}
}
