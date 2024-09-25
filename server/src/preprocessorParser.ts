import { DocumentSymbol, SemanticTokensBuilder } from 'vscode-languageserver';
import { Issue, LexerToken, SyntaxIssue, Token, TokenIndexes, Disposable } from './types';
import {
	adjesentTokens,
	genIssue,
	createTokenIndex,
	validateToken,
	validateValue,
	validToken,
} from './helpers';
import { ASTBase } from './ast/base';
import { Keyword } from './ast/keyword';
import { NumberValue } from './ast/dtc/values/number';
import { Comment } from './ast/dtc/comment';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { Operator, OperatorType } from './ast/cPreprocessors/operator';
import { ComplexExpression, Expression } from './ast/cPreprocessors/expression';
import { FunctionCall } from './ast/cPreprocessors/functionCall';
import { Include, IncludePath } from './ast/cPreprocessors/include';
import { existsSync } from 'fs-extra';
import { resolve, dirname } from 'path';
import { getTokenizedDocmentProvider } from './providers/tokenizedDocument';
import { CMacro } from './ast/cPreprocessors/macro';
import { EventEmitter } from 'stream';
import {
	CElse,
	CEndIf,
	CIfDef,
	CIfNotDef,
	CPreprocessorContent,
	IfDefineBlock,
} from './ast/cPreprocessors/ifDefine';
import { Parser } from './parser';
import { FunctionDefinition } from './ast/cPreprocessors/functionDefinition';

type Callback = (forced: boolean) => void;

export class PreprocessorParser {
	others: ASTBase[] = [];
	includes: Include[] = [];
	positionStack: number[] = [];
	issues: Issue<SyntaxIssue>[] = [];
	protected tokens: Token[];
	chidParsers: (PreprocessorParser | Parser)[] = [];
	private processing: Promise<void> = Promise.resolve();

	constructor(
		public readonly uri: string,
		private readonly incudes: string[],
		private readonly common: string[],
		public macros: Map<string, CMacro> = new Map<string, CMacro>(),
		text?: string
	) {
		const provider = getTokenizedDocmentProvider();

		if (text) {
			this.tokens = provider.renewLexer(uri, text);
		} else {
			this.tokens = getTokenizedDocmentProvider().requestTokens(uri, true);
		}

		this.processing = this.parse();
	}

	get allParsers(): (PreprocessorParser | Parser)[] {
		return [this, ...this.chidParsers.flatMap((p) => p.allParsers)];
	}

	stable(): Promise<void> {
		return this.processing;
	}

	parsedFiles() {
		return [this.uri, ...this.allParsers.flatMap((p) => p.includePaths())];
	}

	includePaths() {
		return this.includes
			.filter(
				(p) => p.path.path.endsWith('.dts') || p.path.path.endsWith('.dtsi') //||
				// p.path.path.endsWith('.h')
			)
			.map((include) => this.resolveInclude(include))
			.filter((p) => p) as string[];
	}

	resolveInclude(include: Include) {
		if (include.path.relative) {
			return [
				resolve(dirname(this.uri), include.path.path),
				...this.common.map((c) => resolve(c, include.path.path)),
			].find(existsSync);
		} else {
			return this.incudes.map((p) => resolve(p, include.path.path)).find(existsSync);
		}
	}

	get done() {
		return this.peekIndex() >= this.tokens.length;
	}

	private cleanUpComments() {
		const tokensConsumedIndexes: number[] = [];
		for (let i = 0; i < this.tokens.length; i++) {
			const result = PreprocessorParser.processComments(this.tokens, i, this.uri);
			if (result) {
				i = result.index;
				tokensConsumedIndexes.push(...result.tokenUsed);
				this.others.push(...result.comments);
			}
		}
		tokensConsumedIndexes.reverse().forEach((i) => this.tokens.splice(i, 1));
	}

	private async lineProcessor() {
		this.enqueToStack();

		//must be firstToken
		if (this.prevToken && this.prevToken.pos.line === this.currentToken?.pos.line) {
			this.moveEndOfLine(this.prevToken.pos.line, false);
			this.mergeStack();
			return;
		}

		const line = this.currentToken?.pos.line;
		const found =
			(await this.processInclude()) ||
			this.processDefinitions() ||
			this.processIfDefBlock();

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

		const resolvedPath = this.resolveInclude(node);
		if (resolvedPath && !resolvedPath.endsWith('.h')) {
			const childParser = resolvedPath.endsWith('.h')
				? new PreprocessorParser(resolvedPath, this.incudes, this.common, this.macros)
				: new Parser(resolvedPath, this.incudes, this.common, this.macros);

			this.chidParsers.push(childParser);

			await childParser.stable();
		}

		const endIndex = this.peekIndex();
		this.tokens.splice(startIndex, endIndex - startIndex);

		this.positionStack[this.positionStack.length - 1] = startIndex;
		return true;
	}

	private processDefinitions() {
		this.enqueToStack();

		const startIndex = this.peekIndex();
		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_DEFINE)) {
			this.popStack();
			return false;
		}

		const keyword = new Keyword(createTokenIndex(token));

		const definition = this.isFuntionDefinition() || this.processCIdentifier();
		if (!definition) {
			this.issues.push(genIssue(SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE, keyword));
			this.mergeStack();
			return true;
		}

		const expression = this.processExpression(true);
		const macro = new CMacro(keyword, definition, expression);
		this.macros.set(macro.name, macro);
		this.others.push(macro);

		const endIndex = this.peekIndex();
		this.tokens.splice(startIndex, endIndex - startIndex);

		this.positionStack[this.positionStack.length - 1] = startIndex;
		this.mergeStack();
		return true;
	}

	private processIfDefBlock() {
		this.enqueToStack();

		const startIndex = this.peekIndex();
		const preIf = this.processIfDef() || this.processIfNotDef();
		if (!preIf) {
			this.popStack();
			return false;
		}

		const elseCase = this.processElseDef();

		let endToken: Token | undefined;
		if (!validToken(this.currentToken, LexerToken.C_ENDIF)) {
			this.issues.push(genIssue(SyntaxIssue.MISSING_C_END_IF, elseCase ?? preIf));
		} else {
			endToken = this.moveToNextToken;
		}

		let endNode: CEndIf | null = null;
		if (endToken) {
			endNode = new CEndIf(createTokenIndex(endToken));
		}

		const node = new IfDefineBlock(preIf, endNode, elseCase);
		node.uri = this.uri;
		this.others.push(node);

		const rangeToClean = node.getInValidTokenRange(this.macros, this.tokens).reverse();
		rangeToClean.forEach((r) => {
			this.tokens.splice(r.start, r.end - r.start + 1);
		});

		this.positionStack[this.positionStack.length - 1] = startIndex;
		this.mergeStack();
		return true;
	}

	private processIfDef() {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_IFDEF)) {
			this.popStack();
			return;
		}

		const keyword = new Keyword(createTokenIndex(token));

		const identifier = this.processCIdentifier();
		if (!identifier) {
			this.issues.push(genIssue(SyntaxIssue.EXPECTED_IDENTIFIER, keyword));
		}

		const tokens = this.moveToToken(
			[LexerToken.C_ELSE, LexerToken.C_ENDIF].map((t) => validateToken(t))
		);

		let content: CPreprocessorContent | null = null;
		if (tokens.length) {
			content = new CPreprocessorContent(createTokenIndex(tokens[0], tokens.at(-1)));
		}

		const node = new CIfDef(keyword, identifier ?? null, content);

		this.mergeStack();
		return node;
	}

	private processIfNotDef() {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_IFNDEF)) {
			this.popStack();
			return;
		}

		const keyword = new Keyword(createTokenIndex(token));

		const identifier = this.processCIdentifier();
		if (!identifier) {
			this.issues.push(genIssue(SyntaxIssue.EXPECTED_IDENTIFIER, keyword));
		}

		const tokens = this.moveToToken(
			[LexerToken.C_ELSE, LexerToken.C_ENDIF].map((t) => validateToken(t))
		);

		let content: CPreprocessorContent | null = null;
		if (tokens.length) {
			content = new CPreprocessorContent(createTokenIndex(tokens[0], tokens.at(-1)));
		}
		const node = new CIfNotDef(keyword, identifier ?? null, content);

		this.mergeStack();
		return node;
	}

	private processElseDef() {
		this.enqueToStack();

		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_ELSE)) {
			this.popStack();
			return;
		}

		const keyword = new Keyword(createTokenIndex(token));

		const tokens = this.moveToToken([LexerToken.C_ENDIF].map((t) => validateToken(t)));
		let content: CPreprocessorContent | null = null;
		if (tokens.length) {
			content = new CPreprocessorContent(createTokenIndex(tokens[0], tokens.at(-1)));
		}
		const node = new CElse(keyword, content);

		this.mergeStack();
		return node;
	}

	private async preProcess() {
		await this.lineProcessor();
	}

	protected async parse() {
		console.log('C Parsing begin', this.uri);

		this.cleanUpComments();

		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		while (!this.done) {
			await this.preProcess();
		}

		if (this.positionStack.length !== 1) {
			throw new Error('Incorrect final stack size');
		}

		this.positionStack = [];
		console.log('C Parsing end', this.uri);
	}

	private static processComments(tokens: Token[], index: number, uri: string) {
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
				node.uri = uri;
				comments.push(node);

				lastLine = currentToken().pos.line ?? 0;

				start = currentToken();
			}
			token = move();
		} while (index < tokens.length && !isEndComment());

		const node = new Comment(createTokenIndex(start, prevToken()));
		comments.push(node);

		move();
		return {
			comments,
			tokenUsed,
			index: index - 1,
		};
	}

	protected processHex(): NumberValue | undefined {
		this.enqueToStack();

		const validStart = this.checkConcurrentTokens([validateValue('0'), validateValue('x')]);

		if (!validStart.length) {
			this.popStack();
			return;
		}

		const validValue = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.HEX].map(validateToken)
		);

		if (!validValue.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(validValue.map((v) => v.value).join(''), 16);
		const numbeValue = new NumberValue(
			num,
			createTokenIndex(validStart[0], validValue.at(-1))
		);

		this.mergeStack();
		return numbeValue;
	}

	protected processDec(): NumberValue | undefined {
		this.enqueToStack();

		const valid = this.consumeAnyConcurrentTokens([LexerToken.DIGITS].map(validateToken));

		if (!valid.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(valid.map((v) => v.value).join(''), 10);
		const numbeValue = new NumberValue(num, createTokenIndex(valid[0], valid.at(-1)));

		this.mergeStack();
		return numbeValue;
	}

	protected processCIdentifier(): CIdentifier | undefined {
		this.enqueToStack();

		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGITS, LexerToken.LETTERS, LexerToken.UNDERSCOURE].map(validateToken)
		);

		if (!valid.length) {
			this.popStack();
			return undefined;
		}

		const name = valid.map((v) => v.value).join('');

		if (!name.match(/^[_A-Za-z]/)) {
			this.popStack();
			return;
		}

		const idnetifier = new CIdentifier(name, createTokenIndex(valid[0], valid.at(-1)));
		idnetifier.uri = this.uri;

		this.mergeStack();
		return idnetifier;
	}

	protected isOperator(): Operator | undefined {
		this.enqueToStack();
		const start = this.moveToNextToken;

		if (!start) {
			this.popStack();
			return;
		}

		let end = start;

		let operator: OperatorType | undefined;
		if (validToken(start, LexerToken.AMPERSAND)) {
			operator = OperatorType.BIT_AND;
			if (validToken(this.currentToken, LexerToken.AMPERSAND)) {
				operator = OperatorType.BOOLEAN_AND;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_NOT)) {
			operator = OperatorType.BIT_NOT;
			if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_NOT_EQ;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_OR)) {
			operator = OperatorType.BIT_OR;
			if (validToken(this.currentToken, LexerToken.BIT_OR)) {
				operator = OperatorType.BOOLEAN_OR;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_XOR)) {
			operator = OperatorType.BIT_XOR;
		} else if (validToken(start, LexerToken.GT_SYM)) {
			operator = OperatorType.BOOLEAN_GT;
			if (validToken(this.currentToken, LexerToken.GT_SYM)) {
				operator = OperatorType.BIT_RIGHT_SHIFT;
				end = this.moveToNextToken;
			} else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_GT_EQUAL;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.LT_SYM)) {
			operator = OperatorType.BOOLEAN_GT;
			if (validToken(this.currentToken, LexerToken.LT_SYM)) {
				operator = OperatorType.BIT_LEFT_SHIFT;
				end = this.moveToNextToken;
			} else if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_LT_EQUAL;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.ADD_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_ADD;
		} else if (validToken(start, LexerToken.NEG_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_SUBTRACT;
		} else if (validToken(start, LexerToken.MULTI_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_MULTIPLE;
		} else if (validToken(start, LexerToken.FORWARD_SLASH)) {
			operator = OperatorType.ARITHMETIC_DIVIDE;
		} else if (validToken(start, LexerToken.MODULUS_OPERATOR)) {
			operator = OperatorType.ARITHMETIC_MODULES;
		} else if (validToken(start, LexerToken.HASH)) {
			if (validToken(this.currentToken, LexerToken.HASH)) {
				operator = OperatorType.C_CONCAT;
				end = this.moveToNextToken;
			}
		}

		if (operator) {
			const node = new Operator(operator, createTokenIndex(start, end));
			node.uri = this.uri;
			this.mergeStack();
			return node;
		}
		this.popStack();
		return;
	}

	protected isFuntionDefinition(): FunctionDefinition | undefined {
		this.enqueToStack();
		const identifier = this.processCIdentifier();
		if (!identifier) {
			this.popStack();
			return;
		}

		let token = this.moveToNextToken;
		if (!validToken(token, LexerToken.ROUND_OPEN)) {
			this.popStack();
			return;
		}

		const params: CIdentifier[] = [];
		let param = this.processCIdentifier();
		while (param) {
			params.push(param);
			if (
				!validToken(this.currentToken, LexerToken.COMMA) &&
				!validToken(this.currentToken, LexerToken.ROUND_CLOSE)
			) {
				this.issues.push(genIssue(SyntaxIssue.MISSING_COMMA, param));
			} else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				token = this.moveToNextToken;
			}
			param = this.processCIdentifier();
		}

		if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
			this.issues.push(
				genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? identifier)
			);
		} else {
			token = this.moveToNextToken;
		}

		const node = new FunctionDefinition(identifier, params);
		node.uri = this.uri;

		this.mergeStack();
		return node;
	}

	protected isFuntionCall(): FunctionCall | undefined {
		this.enqueToStack();
		const identifier = this.processCIdentifier();
		if (!identifier) {
			this.popStack();
			return;
		}

		let token = this.moveToNextToken;
		if (!validToken(token, LexerToken.ROUND_OPEN)) {
			this.popStack();
			return;
		}

		const params: Expression[] = [];
		let exp = this.processExpression(true);
		while (exp) {
			params.push(exp);
			if (
				!validToken(this.currentToken, LexerToken.COMMA) &&
				!validToken(this.currentToken, LexerToken.ROUND_CLOSE)
			) {
				this.issues.push(genIssue(SyntaxIssue.MISSING_COMMA, exp));
			} else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				token = this.moveToNextToken;
			}
			exp = this.processExpression();
		}

		if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
			this.issues.push(
				genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, params.at(-1) ?? identifier)
			);
		} else {
			token = this.moveToNextToken;
		}

		const node = new FunctionCall(identifier, params);
		node.uri = this.uri;

		this.mergeStack();
		return node;
	}

	protected processExpression(assumComplex = false): Expression | undefined {
		this.enqueToStack();

		let complexExpression = false || assumComplex;

		let start: Token | undefined;
		let token: Token | undefined;
		let expression: Expression | undefined;

		let hasOpenBraket = false;
		if (validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
			complexExpression = true;
			start = this.moveToNextToken;
			token = start;
			expression = this.processExpression(true);
			hasOpenBraket = true;
		}

		expression ??=
			this.isFuntionCall() ||
			this.processCIdentifier() ||
			this.processHex() ||
			this.processDec(); // todo process 0x
		if (!expression) {
			this.popStack();
			return;
		}

		if (complexExpression) {
			const operator = this.isOperator();

			if (operator) {
				// complex
				const nextExpression = this.processExpression(true);

				if (!nextExpression) {
					this.issues.push(genIssue(SyntaxIssue.EXPECTED_EXPRESSION, operator));
				} else {
					expression = new ComplexExpression(expression, {
						operator,
						expression: nextExpression,
					});
					expression.uri = this.uri;
				}
			}
		}

		if (hasOpenBraket) {
			if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				const node = new ASTBase(createTokenIndex(this.prevToken!));
				this.issues.push(genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, node));
			} else {
				token = this.moveToNextToken;
			}
		}

		this.mergeStack();
		return expression;
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

	get currentToken() {
		return this.tokens.at(this.peekIndex());
	}

	get prevToken() {
		const index = this.peekIndex() - 1;
		if (index < 0) return;
		return this.tokens.at(this.peekIndex() - 1);
	}

	protected moveStackIndex() {
		if (this.positionStack[this.positionStack.length - 1] === undefined) {
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1]++;
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

	getDocumentSymbols(): DocumentSymbol[] {
		return this.allAstItems.flatMap((o) => o.getDocumentSymbols());
	}

	get allAstItems() {
		return [...this.includes, ...this.others];
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

	private moveToToken(
		cmps: ((token: Token | undefined, index?: number) => 'yes' | 'no' | 'patrial')[]
	) {
		this.enqueToStack();

		const tokens: Token[] = [];
		while (cmps.every((cmp) => cmp(this.currentToken) === 'no')) {
			tokens.push(this.currentToken!);
			this.moveToNextToken;
		}

		this.mergeStack();
		return tokens;
	}
}
