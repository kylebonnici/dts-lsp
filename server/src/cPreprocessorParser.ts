import { LexerToken, SyntaxIssue, Token } from './types';
import { createTokenIndex, genIssue, validToken } from './helpers';
import { ASTBase } from './ast/base';
import { Keyword } from './ast/keyword';
import { Include, IncludePath } from './ast/cPreprocessors/include';
import { existsSync } from 'fs-extra';
import { resolve, dirname } from 'path';
import { BaseParser } from './baseParser';
import { CommentsParser } from './commensParser';

export class CPreprocessorParser extends BaseParser {
	includes: Include[] = [];

	// tokens must be filtered out from commnets by now
	constructor(public tokens: Token[], public readonly uri: string) {
		super();
		this.parse();
	}

	includePaths(incudes: string[], common: string[]) {
		return this.includes
			.filter((p) => p.path.path.endsWith('.dts') || p.path.path.endsWith('.dtsi'))
			.map((include) => this.resolveInclude(include, incudes, common))
			.filter((p) => p) as string[];
	}

	resolveInclude(include: Include, incudes: string[], common: string[]) {
		if (include.path.relative) {
			return [
				resolve(dirname(this.uri), include.path.path),
				...common.map((c) => resolve(c, include.path.path)),
			].find(existsSync);
		} else {
			return incudes.map((p) => resolve(p, include.path.path)).find(existsSync);
		}
	}

	private parse() {
		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		while (!this.done) {
			this.preProcess();
		}

		if (this.positionStack.length !== 1) {
			throw new Error('Incorrect final stack size');
		}
	}

	protected moveEndOfLine = (line: number, report = true) => {
		if (this.currentToken?.pos.line !== line) {
			return;
		}

		const start = this.currentToken;
		let end: Token | undefined = start;
		while (this.currentToken?.pos.line === line) {
			end = this.moveToNextToken;
		}

		if (report) {
			const node = new ASTBase(createTokenIndex(start, end));
			this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
		}

		return end;
	};

	private async preProcess() {
		await this.lineProcessor();
	}

	private lineProcessor() {
		this.enqueToStack();

		//must be firstToken
		if (this.prevToken && this.prevToken.pos.line === this.currentToken?.pos.line) {
			this.moveEndOfLine(this.prevToken.pos.line, false);
			this.mergeStack();
			return;
		}

		const line = this.currentToken?.pos.line;
		const found = this.processInclude();

		if (line !== undefined) {
			this.moveEndOfLine(line, !!found);
		}

		this.mergeStack();
	}

	private async processInclude(): Promise<boolean> {
		this.enqueToStack();

		const startIndex = this.peekIndex();
		const start = this.moveToNextToken;
		let token = start;
		if (!token || !validToken(token, LexerToken.C_INCLUDE)) {
			this.popStack();
			return false;
		}

		const line = start?.pos.line;
		const keyword = new Keyword(createTokenIndex(token));

		token = this.moveToNextToken;
		const pathStart = token;
		const relative = !!validToken(token, LexerToken.STRING);
		if (!pathStart || (!relative && !validToken(token, LexerToken.LT_SYM))) {
			if (line) this.moveEndOfLine(line);
			this.mergeStack();
			return true;
		}

		let path = '';

		if (relative) {
			path = token?.value ?? '';
		} else {
			while (
				this.currentToken?.pos.line === line &&
				!validToken(this.currentToken, LexerToken.GT_SYM)
			) {
				path += this.currentToken?.value ?? '';
				token = this.moveToNextToken;
			}
		}

		const incudePath = new IncludePath(path, relative, createTokenIndex(pathStart, token));
		const node = new Include(keyword, incudePath);
		node.uri = this.uri;
		this.includes.push(node);

		if (!relative) {
			if (
				this.currentToken?.pos.line !== line ||
				!validToken(this.currentToken, LexerToken.GT_SYM)
			) {
				this.issues.push(genIssue(SyntaxIssue.INCLUDE_CLOSE_PATH, node));
			} else {
				token = this.moveToNextToken;
			}
		}

		this.mergeStack();

		const endIndex = this.peekIndex();
		this.tokens.splice(startIndex, endIndex - startIndex);

		this.positionStack[this.positionStack.length - 1] = startIndex;
		return true;
	}

	get allAstItems(): ASTBase[] {
		return this.includes;
	}
}
