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

import {
	DocumentSymbol,
	SemanticTokensBuilder,
	WorkspaceSymbol,
} from 'vscode-languageserver';
import {
	FileDiagnostic,
	LexerToken,
	MacroRegistryItem,
	SyntaxIssue,
	Token,
	TokenIndexes,
} from './types';
import {
	adjacentTokens,
	createTokenIndex,
	genSyntaxDiagnostic,
	isPathEqual,
	startsWithLetter,
	validateToken,
	validateValue,
	validToken,
} from './helpers';
import { ASTBase } from './ast/base';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { Operator, OperatorType } from './ast/cPreprocessors/operator';
import { FunctionDefinition } from './ast/cPreprocessors/functionDefinition';
import { CMacroCall, CMacroCallParam } from './ast/cPreprocessors/functionCall';
import { ComplexExpression, Expression } from './ast/cPreprocessors/expression';
import { NumberValue } from './ast/dtc/values/number';

export abstract class BaseParser {
	positionStack: number[] = [];
	protected _issues: FileDiagnostic[] = [];

	protected parsing: Promise<void>;

	public abstract get uri(): string;
	public abstract get tokens(): Token[];
	protected abstract parse(): Promise<void>;
	public abstract reparse(
		macros?: Map<string, MacroRegistryItem>,
	): Promise<void>;

	constructor() {
		this.parsing = new Promise<void>((resolve) => {
			setTimeout(() => {
				this.parse().then(resolve);
			});
		});
	}

	protected reset() {
		this.issueLengthPositionStack = [];
		this.positionStack = [];
		this._issues = [];
	}

	get issues(): FileDiagnostic[] {
		return this._issues;
	}

	get stable() {
		return this.parsing;
	}

	get done() {
		return this.peekIndex() >= this.tokens.length;
	}

	protected get moveToNextToken(): Token | undefined {
		const token = this.currentToken;

		if (!token) return;
		this.moveStackIndex();

		return token;
	}

	private issueLengthPositionStack: number[] = [];

	protected enqueueToStack() {
		this.issueLengthPositionStack.push(this._issues.length);
		this.positionStack.push(this.peekIndex());
	}

	protected popStack() {
		const prevLength = this.issueLengthPositionStack.pop() ?? 0;
		if (prevLength !== this._issues.length) {
			this._issues.splice(prevLength);
		}
		this.positionStack.pop();
	}

	protected mergeStack() {
		const length = this.issueLengthPositionStack.pop();
		const value = this.positionStack.pop();

		if (value === undefined || length === undefined) {
			/* istanbul ignore next */
			throw new Error('Index out of bounds');
		}

		this.positionStack[this.positionStack.length - 1] = value;
	}

	protected peekIndex(depth = 1) {
		const peek = this.positionStack.at(-1 * depth);
		if (peek === undefined) {
			/* istanbul ignore next */
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
		const index = this.positionStack.length - 1;
		if (this.positionStack[index] === undefined) {
			/* istanbul ignore next */
			throw new Error('Index out of bounds');
		}

		if (this.positionStack[index] !== this.tokens.length) {
			this.positionStack[index]++;
		}
	}

	protected checkConcurrentTokens(
		cmps: ((
			token: Token | undefined,
			index?: number,
		) => 'yes' | 'no' | 'partial')[],
	) {
		this.enqueueToStack();

		const tokens: Token[] = [];

		cmps.every((cmp) => {
			const token = this.currentToken;
			const result = cmp(token);
			let continueLoop = false;

			if (result !== 'no' && token) {
				tokens.push(token);
				this.moveToNextToken;
				continueLoop = adjacentTokens(token, this.currentToken);
			}
			return result === 'yes' && continueLoop;
		});

		this.mergeStack();
		return tokens;
	}

	protected consumeAnyConcurrentTokens(
		cmps: ((
			token: Token | undefined,
			index?: number,
		) => 'yes' | 'no' | 'partial')[],
	) {
		this.enqueueToStack();

		const tokens: Token[] = [];

		let token: Token | undefined;
		let continueLoop = true;
		while (
			cmps.some((cmp) => cmp(this.currentToken) === 'yes' && continueLoop)
		) {
			tokens.push(this.currentToken!);
			token = this.moveToNextToken;
			continueLoop = adjacentTokens(token, this.currentToken);
		}

		this.mergeStack();
		return tokens;
	}

	abstract get allAstItems(): ASTBase[];

	getDocumentSymbols(uri: string): DocumentSymbol[] {
		return this.allAstItems.flatMap((o) => o.getDocumentSymbols(uri));
	}

	getWorkspaceSymbols(): WorkspaceSymbol[] {
		return this.allAstItems.flatMap((o) => o.getWorkspaceSymbols());
	}

	buildSemanticTokens(tokensBuilder: SemanticTokensBuilder, uri: string) {
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
			tokenIndexes?: TokenIndexes,
		) => {
			if (
				!tokenIndexes?.start ||
				!tokenIndexes?.end ||
				!isPathEqual(tokenIndexes.start.uri, uri) ||
				!isPathEqual(tokenIndexes.end.uri, uri)
			)
				return;

			const lengthEnd =
				tokenIndexes.end.pos.colEnd - tokenIndexes.start.pos.col;
			result.push({
				line: tokenIndexes.start.pos.line,
				char: tokenIndexes.start.pos.col,
				length:
					tokenIndexes.end === tokenIndexes.start
						? tokenIndexes.end.pos.len
						: lengthEnd,
				tokenType,
				tokenModifiers,
			});
		};

		this.allAstItems.forEach((a) => {
			a.buildSemanticTokens(push);
		});

		result
			.sort((a, b) =>
				a.line === b.line ? a.char - b.char : a.line - b.line,
			)
			.forEach((r) =>
				tokensBuilder.push(
					r.line,
					r.char,
					r.length,
					r.tokenType,
					r.tokenModifiers,
				),
			);
	}

	protected processCIdentifier(
		macros: Map<string, MacroRegistryItem>,
		skippingIssueChecking: boolean,
	): CIdentifier | undefined {
		this.enqueueToStack();

		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
				validateToken,
			),
		);

		if (!valid.length) {
			this.popStack();
			return undefined;
		}

		if (!startsWithLetter(valid?.[0]?.value)) {
			this.popStack();
			return;
		}

		const name = valid.map((v) => v.value).join('');

		const identifier = new CIdentifier(
			name,
			createTokenIndex(valid[0], valid.at(-1)),
		);

		if (!skippingIssueChecking && identifier.name !== 'defined') {
			const macro = macros.get(identifier.name);
			if (!macro) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.UNKNOWN_MACRO,
						identifier.rangeTokens,
						identifier,
					),
				);
			}
		}

		this.mergeStack();
		return identifier;
	}

	protected isOperator(): Operator | undefined {
		this.enqueueToStack();
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
		} else if (validToken(start, LexerToken.LOGICAL_NOT)) {
			operator = OperatorType.LOGICAL_NOT;
			if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_NOT_EQ;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.BIT_NOT)) {
			operator = OperatorType.BIT_NOT;
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
			} else if (
				validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)
			) {
				operator = OperatorType.BOOLEAN_GT_EQUAL;
				end = this.moveToNextToken;
			}
		} else if (validToken(start, LexerToken.LT_SYM)) {
			operator = OperatorType.BOOLEAN_LT;
			if (validToken(this.currentToken, LexerToken.LT_SYM)) {
				operator = OperatorType.BIT_LEFT_SHIFT;
				end = this.moveToNextToken;
			} else if (
				validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)
			) {
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
		} else if (validToken(start, LexerToken.ASSIGN_OPERATOR)) {
			if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
				operator = OperatorType.BOOLEAN_EQ;
				end = this.moveToNextToken;
			}
		}

		if (operator) {
			const node = new Operator(operator, createTokenIndex(start, end));
			this.mergeStack();
			return node;
		}
		this.popStack();
		return;
	}

	protected parseScopedBlock(
		isOpen: (token?: Token) => boolean,
		isClose: (token?: Token) => boolean,
		isSplit?: (token?: Token) => boolean,
	): Block | undefined {
		this.enqueueToStack();

		const start = this.moveToNextToken;
		if (!start || !isOpen(start)) {
			this.popStack();
			return;
		}

		const index = this.peekIndex();
		const rewind = () => {
			this.positionStack[this.positionStack.length - 1] = index;
		};

		const expandItems = (items: BlockItem[]): Token[] => {
			return items.flatMap((i) =>
				'items' in i ? expandItems(i.items) : i,
			);
		};

		const items: BlockItem[] = [start];
		const separatorTokens: Token[] = [];
		const split: { rewind: () => void; tokens: Token[] }[] = [];
		split[0] = { rewind, tokens: [] };

		let token = this.currentToken;
		while (token && !isClose(token)) {
			if (isSplit?.(token)) {
				const index = this.peekIndex() + 1;
				const rewind = () => {
					this.positionStack[this.positionStack.length - 1] = index;
				};
				items.push(token);
				separatorTokens.push(token);
				split[split.length] = { rewind, tokens: [] };
			} else if (isOpen(token)) {
				const nestedBlock = this.parseScopedBlock(
					isOpen,
					isClose,
					isSplit,
				);
				if (nestedBlock) {
					items.push(nestedBlock);
					split[split.length - 1].tokens.push(
						...expandItems(nestedBlock.items),
					);
				}
				token = this.currentToken;
				continue;
			} else {
				items.push(token);
				split[split.length - 1].tokens.push(token);
			}

			this.moveToNextToken;
			token = this.currentToken;
		}

		const end = token;
		if (end && isClose(end)) {
			this.moveToNextToken;
			items.push(end);
		}

		const block: Block = {
			startToken: start,
			items,
			splitTokens: split,
			endToken: end,
			separatorTokens,
		};

		this.mergeStack();
		return block;
	}

	protected isFunctionCall(
		macros: Map<string, MacroRegistryItem>,
	): CMacroCall | undefined {
		this.enqueueToStack();

		const identifier = this.processCIdentifier(macros, false);
		if (!identifier) {
			this.popStack();
			return;
		}

		if (!adjacentTokens(identifier.lastToken, this.currentToken)) {
			this.popStack();
			return;
		}

		const params = this.processMacroCallParams();

		if (!params) {
			this.popStack();
			return;
		}

		if (identifier.name === 'defined') {
			if (params.length > 1) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.MACRO_EXPECTS_LESS_PARAMS,
						identifier.rangeTokens,
						identifier,
					),
				);
			} else if (params.length < 1) {
				this._issues.push(
					genSyntaxDiagnostic(
						SyntaxIssue.MACRO_EXPECTS_MORE_PARAMS,
						identifier.rangeTokens,
						identifier,
					),
				);
			}
		} else {
			const macro = macros.get(identifier.name)?.macro;
			if (macro) {
				if (!(macro?.identifier instanceof FunctionDefinition)) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.EXPECTED_FUNCTION_LIKE,
							identifier.rangeTokens,
							identifier,
						),
					);
				} else if (params.length > macro.identifier.params.length) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.MACRO_EXPECTS_LESS_PARAMS,
							identifier.rangeTokens,
							identifier,
							{ linkedTo: [macro] },
						),
					);
				} else if (params.length < macro.identifier.params.length) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.MACRO_EXPECTS_MORE_PARAMS,
							identifier.rangeTokens,
							identifier,
							{ linkedTo: [macro] },
						),
					);
				}
			}
		}

		const node = new CMacroCall(identifier, params);
		node.lastToken = this.prevToken;
		this.mergeStack();
		return node;
	}

	protected processHex(): NumberValue | undefined {
		this.enqueueToStack();

		const validStart = this.checkConcurrentTokens([
			validateValue('0'),
			validateValue('x', true),
		]);

		if (validStart.length !== 2) {
			this.popStack();
			return;
		}

		const validValue = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT, LexerToken.HEX].map(validateToken),
		);

		if (!validValue.length) {
			this.popStack();
			return;
		}

		const num = Number.parseInt(
			validValue.map((v) => v.value).join(''),
			16,
		);
		const numberValue = new NumberValue(
			num,
			createTokenIndex(validStart[0], validValue.at(-1)),
		);

		this.mergeStack();
		return numberValue;
	}

	protected processDec(allowOperator = false): NumberValue | undefined {
		this.enqueueToStack();

		let operator: Token | undefined;
		if (
			allowOperator &&
			(validToken(this.currentToken, LexerToken.NEG_OPERATOR) ||
				validToken(this.currentToken, LexerToken.ADD_OPERATOR)) &&
			adjacentTokens(this.currentToken, this.currentToken?.nextToken)
		) {
			operator = this.moveToNextToken;
		}

		const valid = this.consumeAnyConcurrentTokens(
			[LexerToken.DIGIT].map(validateToken),
		);

		if (!valid.length) {
			this.popStack();
			return;
		}

		let num = Number.parseInt(valid.map((v) => v.value).join(''), 10);

		if (operator && validToken(operator, LexerToken.NEG_OPERATOR)) {
			num = 0xffffffff - num;
		}

		const numberValue = new NumberValue(
			num,
			createTokenIndex(operator ?? valid[0], valid.at(-1)),
		);

		this.mergeStack();
		return numberValue;
	}

	private processEnclosedExpression(
		macros: Map<string, MacroRegistryItem>,
		parent: ASTBase,
	) {
		this.enqueueToStack();

		let start: Token | undefined;
		let token: Token | undefined;
		if (validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
			let wrappedExpression: ComplexExpression | undefined;
			start = this.moveToNextToken;
			token = start;
			let expression = this.processExpression(macros, parent, true);
			if (expression) {
				wrappedExpression = new ComplexExpression(expression, true);
				expression = new ComplexExpression(wrappedExpression, false);
				wrappedExpression.openBracket = start;
			}
			if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
				if (start) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.MISSING_ROUND_CLOSE,
							createTokenIndex(start),
							parent,
						),
					);
				}
			} else {
				token = this.moveToNextToken;
				if (wrappedExpression) {
					wrappedExpression.closeBracket = token;
				}
			}

			this.mergeStack();
			return expression;
		}

		this.popStack();
	}

	protected processExpression(
		macros: Map<string, MacroRegistryItem>,
		parent: ASTBase,
		complexExpression = false,
	): Expression | undefined {
		this.enqueueToStack();

		let expression: Expression | undefined;

		let operator: Operator | undefined;
		if (complexExpression) {
			operator = this.isOperator();
		}

		expression =
			this.processEnclosedExpression(macros, parent) ||
			this.isFunctionCall(macros) ||
			this.processCIdentifier(macros, false) ||
			this.processHex() ||
			this.processDec(true);
		if (!expression) {
			this.popStack();
			return;
		}

		if (operator) {
			expression.operator = operator;
		}

		if (complexExpression) {
			let operator = this.isOperator();

			while (operator) {
				// complex
				const nextExpression = this.processExpression(
					macros,
					parent,
					true,
				);

				if (!nextExpression) {
					this._issues.push(
						genSyntaxDiagnostic(
							SyntaxIssue.EXPECTED_EXPRESSION,
							operator.rangeTokens,
							parent,
						),
					);
				} else {
					if (expression instanceof ComplexExpression) {
						expression.addExpression(operator, nextExpression);
					} else {
						expression = new ComplexExpression(expression, false, {
							operator,
							expression: nextExpression,
						});
					}
				}

				operator = this.isOperator();
			}
		}

		this.mergeStack();
		return expression;
	}

	private processMacroCallParams(): (CMacroCallParam | null)[] | undefined {
		if (!validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
			return;
		}

		const block = this.parseScopedBlock(
			(token?: Token) => !!validToken(token, LexerToken.ROUND_OPEN),
			(token?: Token) => !!validToken(token, LexerToken.ROUND_CLOSE),
			(token?: Token) => !!validToken(token, LexerToken.COMMA),
		);

		if (
			block?.items.length === 2 &&
			validToken(block.endToken, LexerToken.ROUND_CLOSE)
		) {
			return [];
		}

		const result = block?.splitTokens.map((param, i) => {
			if (param.tokens.length === 0) return null;
			const p = new CMacroCallParam(
				param.tokens
					.map((p, i) => {
						let v = p.value;
						if (p.pos.line === param.tokens.at(i + 1)?.pos.line) {
							v = v.padEnd(
								param.tokens[i + 1].pos.col - p.pos.col,
								' ',
							);
						} else if (p.value === '\\') {
							v = v.slice(0, -1);
						}
						return v;
					})
					.join(''),
				createTokenIndex(param.tokens[0], param.tokens.at(-1)),
				i,
			);
			p.splitToken = block.separatorTokens.at(i);
			return p;
		});

		return result;
	}

	protected moveEndOfLine = (token: Token, report = true) => {
		const line = token.pos.line;
		if (
			this.currentToken?.pos.line !== line ||
			!isPathEqual(this.currentToken?.uri, token.uri)
		) {
			return;
		}

		const start = this.currentToken;
		let end: Token | undefined = start;
		while (
			this.currentToken?.pos.line === line &&
			isPathEqual(this.currentToken?.uri, token.uri)
		) {
			end = this.moveToNextToken;
		}

		if (report) {
			this._issues.push(
				genSyntaxDiagnostic(
					SyntaxIssue.UNKNOWN,
					createTokenIndex(start, end),
					null,
				),
			);
		}

		return end;
	};
}

export type BlockItem = Token | Block;
export interface Block {
	startToken: Token;
	items: BlockItem[];
	splitTokens: { rewind: () => void; tokens: Token[] }[];
	endToken?: Token;
	separatorTokens: Token[];
}
