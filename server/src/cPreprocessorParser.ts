/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { DiagnosticSeverity, DiagnosticTag } from 'vscode-languageserver';
import { LexerToken, MacroRegistryItem, SyntaxIssue, Token } from './types';
import {
	adjacentTokens,
	createTokenIndex,
	genSyntaxDiagnostic,
	isPathEqual,
	parseMacros,
	sameLine,
	validateToken,
	validateValue,
	validToken,
} from './helpers';
import { ASTBase } from './ast/base';
import { Keyword } from './ast/keyword';
import { Include, IncludePath } from './ast/cPreprocessors/include';
import { BaseParser, Block } from './baseParser';
import { getTokenizedDocumentProvider } from './providers/tokenizedDocument';
import { CommentsParser } from './commentsParser';
import { CMacro, CMacroContent } from './ast/cPreprocessors/macro';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import {
	FunctionDefinition,
	Variadic,
} from './ast/cPreprocessors/functionDefinition';
import {
	CElse,
	CIf,
	CIfDef,
	CIfNotDef,
	CPreprocessorContent,
	IfDefineBlock,
	IfElIfBlock,
} from './ast/cPreprocessors/ifDefine';
import { getCachedCPreprocessorParserProvider } from './providers/cachedCPreprocessorParser';
import { Expression } from './ast/cPreprocessors/expression';

export class CPreprocessorParser extends BaseParser {
	public tokens: Token[] = [];
	private nodes: ASTBase[] = [];
	private _comments: ASTBase[] = [];
	public dtsIncludes: Include[] = [];
	private macroSnapShot: Map<string, MacroRegistryItem> = new Map<
		string,
		MacroRegistryItem
	>();
	public readonly macros: Map<string, MacroRegistryItem> = new Map<
		string,
		MacroRegistryItem
	>();

	// tokens must be filtered out from comments by now
	constructor(
		public readonly uri: string,
		private incudes: string[],
		macros?: Map<string, MacroRegistryItem>,
		private getTokens?: () => Token[],
		private skipIncludes?: boolean,
	) {
		super();
		if (macros) {
			Array.from(macros).forEach(([k, m]) =>
				this.macroSnapShot.set(k, m),
			);
			Array.from(macros).forEach(([k, m]) => this.macros.set(k, m));
		}
	}

	get comments() {
		return this._comments;
	}
	private macroStart = false;

	protected get currentToken(): Token | undefined {
		// allow to break line at end of line with \
		const prevToken = this.prevToken;
		const tokenPartOfMacro =
			sameLine(prevToken, this.tokens.at(this.peekIndex())) ||
			!prevToken ||
			(validToken(prevToken, LexerToken.BACK_SLASH) &&
				prevToken.pos.line + 1 ===
					this.tokens.at(this.peekIndex())?.pos.line);
		if (this.macroStart && !tokenPartOfMacro) return;

		if (
			this.macroStart &&
			validToken(this.tokens.at(this.peekIndex()), LexerToken.BACK_SLASH)
		) {
			this.moveStackIndex();
			return this.currentToken;
		}

		return this.tokens.at(this.peekIndex());
	}

	protected reset(macros?: Map<string, MacroRegistryItem>) {
		super.reset();
		this.macros.clear();
		if (macros) {
			this.macroSnapShot.clear();
			Array.from(macros).forEach(([k, m]) =>
				this.macroSnapShot.set(k, m),
			);
			Array.from(macros).forEach(([k, m]) => this.macros.set(k, m));
		} else {
			Array.from(this.macroSnapShot).forEach(([k, m]) =>
				this.macros.set(k, m),
			);
		}

		this.nodes = [];
		this.dtsIncludes = [];
	}

	public async reparse(
		macros?: Map<string, MacroRegistryItem>,
	): Promise<void> {
		const stable = this.stable;
		this.parsing = new Promise<void>((resolve) => {
			stable.then(() => {
				if (macros && macros.size === this.macroSnapShot.size) {
					const arr = Array.from(macros);
					if (
						Array.from(this.macroSnapShot).every(([k, m], i) => {
							const [kk, mm] = arr[i];
							return (
								kk === k &&
								mm.macro.toString() === m.macro.toString()
							);
						})
					) {
						console.log('header file cache hit', this.uri);
						resolve();
						return;
					}
				}
				this.reset(macros);
				this.parse().then(resolve);
			});
		});
		return this.parsing;
	}

	public async parse() {
		const commentsParser = new CommentsParser(this.uri, this.getTokens);
		await commentsParser.stable;
		this.tokens = commentsParser.tokens;
		this._comments = commentsParser.allAstItems;

		this.positionStack.push(0);
		if (this.tokens.length === 0) {
			return;
		}

		while (!this.done) {
			await this.lineProcessor();
		}

		if (this.positionStack.length !== 1) {
			/* istanbul ignore next */
			throw new Error('Incorrect final stack size');
		}
	}

	private async lineProcessor() {
		this.enqueueToStack();

		//must be firstToken
		const isFirstTokenOnLine =
			!this.prevToken ||
			this.prevToken.pos.line !== this.currentToken?.pos.line ||
			!isPathEqual(this.prevToken.uri, this.currentToken.uri);
		if (!isFirstTokenOnLine) {
			this.moveEndOfLine(this.prevToken!, false);
			this.mergeStack();
			return;
		}

		const token = this.currentToken;
		const found =
			(await this.processInclude()) ||
			this.processDefinitions() ||
			this.processUndef() ||
			this.processIfDefBlocks();

		if (token) {
			this.moveEndOfLine(token, !!found);
		}

		this.mergeStack();
	}

	private processDefinitions() {
		this.enqueueToStack();

		const startIndex = this.peekIndex();
		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_DEFINE)) {
			this.popStack();
			return false;
		}

		this.macroStart = true;

		const keyword = new Keyword(createTokenIndex(token));

		const definition =
			this.isFunctionDefinition() ||
			this.processCIdentifier(this.macros, true);
		if (!definition) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
			this.mergeStack();
			this.macroStart = false;
			return true;
		}

		const definitionContent = this.consumeDefinitionContent();
		let content: CMacroContent | undefined;
		if (definitionContent.length) {
			content = new CMacroContent(
				createTokenIndex(
					definitionContent[0],
					definitionContent.at(-1),
				),
				definitionContent,
			);
		}
		const macro = new CMacro(keyword, definition, content);
		this.macros.set(macro.name, {
			macro,
			resolver: parseMacros(macro.toString()),
		} satisfies MacroRegistryItem);
		this.nodes.push(macro);

		const endIndex = this.peekIndex();
		this.tokens.splice(startIndex, endIndex - startIndex);

		this.positionStack[this.positionStack.length - 1] = startIndex;
		this.mergeStack();
		this.macroStart = false;
		return true;
	}

	private processUndef() {
		this.enqueueToStack();

		const startIndex = this.peekIndex();
		const token = this.moveToNextToken;
		if (!token || !validToken(token, LexerToken.C_UNDEF)) {
			this.popStack();
			return false;
		}

		this.macroStart = true;

		const keyword = new Keyword(createTokenIndex(token));

		const definition = this.processCIdentifier(this.macros, true);
		if (!definition) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE,
					keyword.firstToken,
					keyword.lastToken,
					keyword,
				),
			);
			this.mergeStack();
			this.macroStart = false;
			return true;
		}

		const macro = new CMacro(keyword, definition);
		this.macros.delete(definition.name);
		this.nodes.push(macro);

		const endIndex = this.peekIndex();
		this.tokens.splice(startIndex, endIndex - startIndex);

		this.positionStack[this.positionStack.length - 1] = startIndex;
		this.mergeStack();
		this.macroStart = false;
		return true;
	}

	private consumeDefinitionContent(): Token[] {
		const tokens: Token[] = [];

		while (this.currentToken) {
			const token = this.moveToNextToken;
			if (token) {
				tokens.push(token);
			}
		}

		return tokens;
	}

	protected isFunctionDefinition(): FunctionDefinition | undefined {
		this.enqueueToStack();
		const identifier = this.processCIdentifier(this.macros, true);
		if (!identifier) {
			this.popStack();
			return;
		}

		let token = this.moveToNextToken;
		if (
			!validToken(token, LexerToken.ROUND_OPEN) ||
			!adjacentTokens(identifier.lastToken, token)
		) {
			this.popStack();
			return;
		}

		const params: (CIdentifier | Variadic)[] = [];
		let param =
			this.processCIdentifier(this.macros, true) ||
			this.processVariadic();

		while (param) {
			params.push(param);
			if (
				!validToken(this.currentToken, LexerToken.COMMA) &&
				!validToken(this.currentToken, LexerToken.ROUND_CLOSE)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.MISSING_COMMA,
						param.firstToken,
						param.lastToken,
						param,
					),
				);
			} else if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				token = this.moveToNextToken;
			}

			param =
				this.processCIdentifier(this.macros, true) ||
				this.processVariadic();
		}

		const node = new FunctionDefinition(identifier, params);

		if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
			node.lastToken = this.prevToken;
			const issueAST = params.at(-1) ?? node;
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_ROUND_CLOSE,
					issueAST.firstToken,
					issueAST.lastToken,
					issueAST,
				),
			);
		} else {
			token = this.moveToNextToken;
			node.lastToken = token;
		}

		this.mergeStack();
		return node;
	}

	private processVariadic() {
		this.enqueueToStack();

		const valid = this.checkConcurrentTokens([
			validateToken(LexerToken.PERIOD),
			validateToken(LexerToken.PERIOD),
			validateToken(LexerToken.PERIOD),
		]);

		if (valid.length !== 3) {
			this.popStack();
			return;
		}

		const variadic = new Variadic(createTokenIndex(valid[0], valid.at(-1)));
		this.mergeStack();
		return variadic;
	}

	private processIfDefBlocks() {
		const startIndex = this.peekIndex();

		const block = this.parseScopedBlock(
			(token?: Token) => {
				return (
					!!token &&
					[
						LexerToken.C_IFDEF,
						LexerToken.C_IFNDEF,
						LexerToken.C_IF,
					].some((t) => validToken(token, t)) &&
					!sameLine(token.prevToken, token)
				);
			},
			(token?: Token) => {
				return (
					!!token &&
					[LexerToken.C_ENDIF].some((t) => validToken(token, t)) &&
					!sameLine(token.prevToken, token)
				);
			},
			(token?: Token) => {
				return (
					!!token &&
					[LexerToken.C_ELSE, LexerToken.C_ELIF].some((t) =>
						validToken(token, t),
					) &&
					!sameLine(token.prevToken, token)
				);
			},
		);
		if (!block) {
			return;
		}

		let ifDefBlock: IfDefineBlock | IfElIfBlock | undefined;
		if (validToken(block.startToken, LexerToken.C_IF)) {
			ifDefBlock = this.processIfBlock(
				block,
				(
					keyword: Keyword,
					identifier: Expression | null,
					content: CPreprocessorContent | null,
				) => new CIf(keyword, identifier ?? null, content),
			);
		} else {
			ifDefBlock = this.processIfDefBlock(
				block,
				(
					keyword: Keyword,
					identifier: CIdentifier | null,
					content: CPreprocessorContent | null,
				) =>
					validToken(block.startToken, LexerToken.C_IFDEF)
						? new CIfDef(keyword, identifier ?? null, content)
						: new CIfNotDef(keyword, identifier ?? null, content),
			);
		}

		this.nodes.push(ifDefBlock);

		const rangeToClean = ifDefBlock
			.getInValidTokenRange(this.macros, this.tokens)
			.reverse();
		rangeToClean.forEach((r) => {
			this.tokens.splice(r.start, r.end - r.start + 1);
		});

		[
			...(ifDefBlock instanceof IfElIfBlock
				? ifDefBlock.ifBlocks
				: [ifDefBlock.ifDef]),
			...(ifDefBlock.elseOption ? [ifDefBlock.elseOption] : []),
		].forEach((b) => {
			if (!b.active && b.content) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.UNUSED_BLOCK,
						b.content.firstToken,
						b.content.lastToken,
						b.content,
						{
							severity: DiagnosticSeverity.Hint,
							tags: [DiagnosticTag.Unnecessary],
						},
					),
				);
			}
		});

		// rewind to proves the content of the if def that was true
		this.positionStack[this.positionStack.length - 1] = startIndex;
		return;
	}

	private processIfDefBlock(
		block: Block,
		ifCreator: (
			keyword: Keyword,
			identifier: CIdentifier | null,
			content: CPreprocessorContent | null,
		) => CIfDef | CIfNotDef,
	): IfDefineBlock {
		this.enqueueToStack();
		this.macroStart = true;

		const ifDefKeyword = new Keyword(createTokenIndex(block.startToken));

		// rewind so we can capture the identifier
		block.splitTokens[0].rewind();
		const identifier = this.processCIdentifier(this.macros, true);
		if (!identifier) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.EXPECTED_IDENTIFIER,
					ifDefKeyword.firstToken,
					ifDefKeyword.lastToken,
					ifDefKeyword,
				),
			);
		}

		this.macroStart = false;

		let ifDefContent: CPreprocessorContent | undefined;
		const contentStart =
			identifier?.lastToken.nextToken ?? ifDefKeyword.lastToken.nextToken;
		if (
			contentStart &&
			block.splitTokens[0].tokens.find((t) => t === contentStart)
		) {
			ifDefContent = new CPreprocessorContent(
				createTokenIndex(
					contentStart,
					block.splitTokens[0].tokens.at(-1),
				),
			);
		}

		const ifDef = ifCreator(
			ifDefKeyword,
			identifier ?? null,
			ifDefContent ?? null,
		);

		let cElse: CElse | undefined;

		if (block.splitTokens.length > 1) {
			const elseToken = block.splitTokens[1].tokens[0].prevToken!;
			const elseKeyword = new Keyword(createTokenIndex(elseToken));
			let elseContent: CPreprocessorContent | undefined;
			if (block.splitTokens[1].tokens.length) {
				elseContent = new CPreprocessorContent(
					createTokenIndex(
						block.splitTokens[1].tokens[0],
						block.splitTokens[1].tokens.at(-1),
					),
				);
			}
			cElse = new CElse(elseKeyword, elseContent ?? null);
		}

		let endifKeyword: Keyword | undefined;
		if (block.endToken) {
			endifKeyword = new Keyword(createTokenIndex(block.endToken));
		} else {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_ENDIF,
					ifDefKeyword.firstToken,
					ifDefKeyword.lastToken,
					ifDefKeyword,
				),
			);
		}

		const ifDefBlock = new IfDefineBlock(
			ifDef,
			endifKeyword ?? null,
			cElse,
		);

		this.mergeStack();
		return ifDefBlock;
	}

	private processIfBlock(
		block: Block,
		ifCreator: (
			keyword: Keyword,
			expression: Expression | null,
			content: CPreprocessorContent | null,
		) => CIf,
	): IfElIfBlock {
		this.enqueueToStack();

		const ifKeyword = new Keyword(createTokenIndex(block.startToken));

		const ifBlocks: CIf[] = [];
		let cElse: CElse | undefined;

		block.splitTokens.forEach((scope, i) => {
			scope.rewind();
			const startToken = this.prevToken!;
			const keyword = new Keyword(createTokenIndex(startToken));

			this.macroStart = true;

			const expression =
				this.processExpression(this.macros, keyword, true) ||
				this.processCIdentifier(this.macros, true);

			this.macroStart = false;

			const isElse =
				i === block.splitTokens.length - 1 &&
				validToken(startToken, LexerToken.C_ELSE);
			if (isElse) {
				const elseToken = startToken;
				const elseKeyword = new Keyword(createTokenIndex(elseToken));
				let elseContent: CPreprocessorContent | undefined;
				if (scope.tokens.length) {
					elseContent = new CPreprocessorContent(
						createTokenIndex(scope.tokens[0], scope.tokens.at(-1)),
					);
				}
				cElse = new CElse(elseKeyword, elseContent ?? null);
			} else {
				if (!expression) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.EXPECTED_IDENTIFIER,
							ifKeyword.firstToken,
							ifKeyword.lastToken,
							ifKeyword,
						),
					);
				}

				let content: CPreprocessorContent | undefined;
				const contentStart =
					expression?.lastToken.nextToken ??
					ifKeyword.lastToken.nextToken;
				if (
					contentStart &&
					scope.tokens.find((t) => t === contentStart)
				) {
					content = new CPreprocessorContent(
						createTokenIndex(
							contentStart,
							block.splitTokens[i].tokens.at(-1),
						),
					);
				}

				const ifBlock = ifCreator(
					keyword,
					expression ?? null,
					content ?? null,
				);
				ifBlocks.push(ifBlock);
			}
		});

		let endifKeyword: Keyword | undefined;
		if (block.endToken) {
			endifKeyword = new Keyword(createTokenIndex(block.endToken));
		} else {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.MISSING_ENDIF,
					ifKeyword.firstToken,
					ifKeyword.lastToken,
					ifKeyword,
				),
			);
		}
		const ifElIfBlock = new IfElIfBlock(
			ifBlocks,
			endifKeyword ?? null,
			cElse,
		);
		this.mergeStack();
		return ifElIfBlock;
	}

	get allAstItems(): ASTBase[] {
		return [...this.dtsIncludes, ...this.nodes, ...this.comments];
	}

	resolveInclude(include: Include) {
		if (!include.path.path) {
			return;
		}
		if (include.path.relative) {
			return [
				resolve(dirname(include.uri), include.path.path),
				...this.incudes.map((c) => resolve(c, include.path.path)),
			].find((p) => existsSync(p));
		} else {
			return this.incudes
				.map((p) => resolve(p, include.path.path))
				.find((p) => existsSync(p));
		}
	}

	private async processInclude(): Promise<boolean> {
		this.enqueueToStack();

		const startIndex = this.peekIndex();
		let token = this.currentToken;

		if (!token) {
			this.popStack();
			return false;
		}

		let keywordStart = token;
		let keywordEnd: Token | undefined = token;
		if (!validToken(token, LexerToken.C_INCLUDE)) {
			const valid = this.checkConcurrentTokens([
				validateToken(LexerToken.FORWARD_SLASH),
				validateValue('include'),
				validateToken(LexerToken.FORWARD_SLASH),
			]);

			if (valid.length !== 3) {
				this.popStack();
				return false;
			}

			keywordStart = valid[0];
			keywordEnd = valid.at(-1);
		} else {
			this.moveToNextToken;
		}

		const t = keywordStart;
		const keyword = new Keyword(createTokenIndex(keywordStart, keywordEnd));

		token = this.moveToNextToken;
		const pathStart = token;
		const relative = !!validToken(token, LexerToken.STRING);
		if (
			!pathStart ||
			(!relative && !validToken(token, LexerToken.LT_SYM))
		) {
			if (t) this.moveEndOfLine(t);
			this.mergeStack();
			return true;
		}

		let path = '';

		if (relative) {
			path = token?.value ?? '';
		} else {
			while (
				this.currentToken?.pos.line === t.pos.line &&
				!validToken(this.currentToken, LexerToken.GT_SYM)
			) {
				path += this.currentToken?.value ?? '';
				token = this.moveToNextToken;
			}
		}

		const includePath = new IncludePath(
			path,
			relative,
			createTokenIndex(pathStart, token),
		);
		const node = new Include(keyword, includePath);
		this.dtsIncludes.push(node);

		if (!relative) {
			if (
				this.currentToken?.pos.line !== t.pos.line ||
				!validToken(this.currentToken, LexerToken.GT_SYM)
			) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.GT_SYM,
						node.firstToken,
						node.lastToken,
						node,
					),
				);
			} else {
				token = this.moveToNextToken;
				includePath.lastToken = token;
			}
		}

		this.mergeStack();

		const endIndex = this.peekIndex();

		const resolvedPath = this.resolveInclude(node);
		node.resolvedPath = resolvedPath;
		if (!resolvedPath) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.UNABLE_TO_RESOLVE_INCLUDE,
					node.path.firstToken,
					node.path.lastToken,
					node.path,
					{ severity: DiagnosticSeverity.Warning },
				),
			);
		}

		if (resolvedPath && !this.skipIncludes) {
			getTokenizedDocumentProvider().requestTokens(resolvedPath, true);
			const fileParser =
				getCachedCPreprocessorParserProvider().getCPreprocessorParser(
					resolvedPath,
					this.incudes,
					this.macros,
					this.uri,
				);

			await fileParser.stable;

			this._issues.push(...fileParser.issues);

			this.macros.clear();
			Array.from(fileParser.macros).forEach(([k, m]) =>
				this.macros.set(k, m),
			);

			if (resolvedPath.endsWith('.h')) {
				this.tokens.splice(startIndex, endIndex - startIndex);
			} else {
				this.tokens.splice(
					startIndex,
					endIndex - startIndex,
					...fileParser.tokens,
				);
			}

			this.nodes.push(...fileParser.nodes);
			this.dtsIncludes.push(...fileParser.dtsIncludes);
		} else {
			this.tokens.splice(startIndex, endIndex - startIndex);
		}

		this.positionStack[this.positionStack.length - 1] = startIndex;
		return true;
	}
}
