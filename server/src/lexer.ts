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

import { adjacentTokens } from './helpers';
import { LexerToken, Position, Token } from './types';

export class Lexer {
	inComment = false;
	inCommentLineStart: number | undefined;
	lineNumber = 0;
	columnNumber = 0;
	lines: string[];
	private _tokens: Token[] = [];

	get tokens() {
		return this._tokens;
	}

	constructor(
		readonly text: string,
		private uri: string,
	) {
		const normalizedText = this.text.replace(/\r\n/g, '\n').trimEnd();
		this.lines = normalizedText.split('\n');

		for (let i = 0; i < this.lines.length; i++) {
			this.lines[i] += '\n';
		}

		this.lexIt();
	}

	private isWhiteSpace() {
		const char = this.currentChar;
		if (!char) return false;
		const code = char.charCodeAt(0);
		// space(32), tab(9), newline(10), carriage return(13), form feed(12), vertical tab(11)
		return (
			code === 32 ||
			code === 9 ||
			code === 10 ||
			code === 13 ||
			code === 12 ||
			code === 11
		);
	}

	private get endOfFile() {
		return this.isOnLastLine && this.isOnLastCharOfLine;
	}

	private get isOnLastLine() {
		return this.lineNumber === this.lines.length - 1;
	}

	private get isOnLastCharOfLine() {
		return this.lines[this.lineNumber].length <= this.columnNumber;
	}

	private moveToNextLine(): boolean {
		while (!this.isOnLastLine) {
			this.columnNumber = 0;
			this.lineNumber++;

			// Skip empty lines
			if (this.lines[this.lineNumber].length > 0) {
				return true;
			}
		}
		return false;
	}

	private moveOnLine() {
		// Optimize: cache line length to avoid repeated getter calls
		const currentLine = this.lines[this.lineNumber];
		const lineLength = currentLine.length;

		if (this.columnNumber >= lineLength) {
			return this.moveToNextLine();
		}

		this.columnNumber++;

		if (this.columnNumber >= lineLength) {
			this.moveToNextLine();
		}
		return true;
	}

	private move(): boolean {
		if (this.lineNumber >= this.lines.length) return false;

		return this.moveOnLine();
	}

	private get currentChar() {
		// Optimize: direct bounds checking is faster than endOfFile getter
		if (this.lineNumber >= this.lines.length) return null;
		const line = this.lines[this.lineNumber];
		return this.columnNumber >= line.length
			? null
			: line[this.columnNumber];
	}

	private static readonly SYNTAX_CHARS = new Set([
		'^',
		'~',
		'|',
		'!',
		'\\',
		'<',
		'>',
		';',
		'=',
		'/',
		'{',
		'}',
		'[',
		']',
		'(',
		')',
		'*',
		'%',
		'&',
		'.',
		':',
		'+',
		'@',
		'-',
		'_',
		',',
		'x',
		'X',
		'?',
	]);

	static isSyntaxChar(char?: string | null): boolean {
		return char ? Lexer.SYNTAX_CHARS.has(char) : false;
	}

	// Helper function to check if character code is a letter (A-Z, a-z)
	private static isLetterCode(charCode: number): boolean {
		return (
			(charCode >= 65 && charCode <= 90) ||
			(charCode >= 97 && charCode <= 122)
		);
	}

	private getWord(): string {
		let word = '';
		while (
			!this.isWhiteSpace() &&
			((word.length && !Lexer.isSyntaxChar(this.currentChar)) ||
				!word.length)
		) {
			word += this.currentChar ?? '';

			if (word.length === 1 && Lexer.isSyntaxChar(this.currentChar)) {
				this.move();
				break;
			}

			const currLine = this.lineNumber;

			if (!this.move() || this.lineNumber !== currLine) {
				return word;
			}
		}

		if (this.inComment && word === '*' && this.currentChar === '/') {
			this.inComment = false;
		}

		if (
			this.inCommentLineStart !== undefined &&
			this.lineNumber !== this.inCommentLineStart
		) {
			this.inCommentLineStart = undefined;
			this.inComment = false;
		}

		if (!this.inComment && word === '/' && this.currentChar === '*') {
			this.inCommentLineStart = undefined;
			this.inComment = true;
		}

		if (!this.inComment && word === '/' && this.currentChar === '/') {
			this.inCommentLineStart = this.lineNumber;
			this.inComment = true;
		}

		return word;
	}

	private getString(quote: string) {
		let strLine = quote;

		let prevToken: Token | undefined;
		while (this.currentChar !== quote) {
			if (this.currentChar === '\n') {
				const line = this.lineNumber;
				const colEnd = this.columnNumber;
				const len = strLine.length;
				this.pushToken({
					tokens: [LexerToken.STRING],
					value: strLine,
					pos: {
						col: colEnd - len,
						line,
						len,
						colEnd,
					},
					adjacentToken: prevToken,
				});
				prevToken = this._tokens.at(-1);

				strLine = '';
			} else if (this.currentChar === '\\') {
				const prevLine = this.lineNumber;
				strLine += this.currentChar ?? '';
				if (this.move()) {
					if (prevLine === this.lineNumber) {
						// escaped char

						strLine += this.currentChar ?? '';
					}
				} else {
					break;
				}
			} else {
				strLine += this.currentChar ?? '';
			}

			if (!this.move()) {
				break;
			}
		}

		strLine += quote;
		const line = this.lineNumber;
		const colEnd = this.columnNumber + 1;
		const len = strLine.length;
		this.pushToken({
			tokens: [LexerToken.STRING],
			value: strLine,
			pos: {
				col: colEnd - len,
				line,
				len,
				colEnd,
			},
			adjacentToken: prevToken,
		});

		this.move();
	}

	private lexIt() {
		while (!this.endOfFile) {
			while (this.isWhiteSpace()) {
				this.move();
			}

			const word = this.getWord();
			if (word) {
				this.process(word);
			}
		}
	}

	private static readonly SINGLE_CHAR_TOKENS = new Map<string, LexerToken[]>([
		['{', [LexerToken.CURLY_OPEN]],
		['}', [LexerToken.CURLY_CLOSE]],
		['(', [LexerToken.ROUND_OPEN]],
		[')', [LexerToken.ROUND_CLOSE]],
		['[', [LexerToken.SQUARE_OPEN]],
		[']', [LexerToken.SQUARE_CLOSE]],
		[';', [LexerToken.SEMICOLON]],
		[':', [LexerToken.COLON]],
		['=', [LexerToken.ASSIGN_OPERATOR]],
		['>', [LexerToken.GT_SYM]],
		['<', [LexerToken.LT_SYM]],
		['!', [LexerToken.LOGICAL_NOT]],
		['|', [LexerToken.BIT_OR]],
		['^', [LexerToken.BIT_XOR]],
		['&', [LexerToken.AMPERSAND, LexerToken.BIT_AND]],
		['~', [LexerToken.BIT_NOT]],
		['/', [LexerToken.FORWARD_SLASH]],
		['\\', [LexerToken.BACK_SLASH]],
		['+', [LexerToken.ADD_OPERATOR]],
		['-', [LexerToken.NEG_OPERATOR]],
		['*', [LexerToken.MULTI_OPERATOR]],
		['%', [LexerToken.MODULUS_OPERATOR]],
		['?', [LexerToken.QUESTION_MARK]],
		['.', [LexerToken.PERIOD]],
		['_', [LexerToken.UNDERSCORE]],
		['@', [LexerToken.AT]],
		[',', [LexerToken.COMMA]],
	]);

	private static readonly KEYWORD_TOKENS = new Map<string, LexerToken>([
		['true', LexerToken.C_TRUE],
		['false', LexerToken.C_FALSE],
		['#define', LexerToken.C_DEFINE], //
		['#include', LexerToken.C_INCLUDE],
		['#line', LexerToken.C_LINE],
		['#undef', LexerToken.C_UNDEF],
		['#error', LexerToken.C_ERROR],
		['#pragma', LexerToken.C_PRAGMA],
		['#defined', LexerToken.C_DEFINED],
		['#if', LexerToken.C_IF],
		['#ifdef', LexerToken.C_IFDEF],
		['#ifndef', LexerToken.C_IFNDEF],
		['#elif', LexerToken.C_ELIF],
		['#else', LexerToken.C_ELSE],
		['#endif', LexerToken.C_ENDIF],
	]);

	private process(word: string): boolean {
		let tokenFound = this.isString(word);
		if (!tokenFound) {
			const keywordToken = Lexer.KEYWORD_TOKENS.get(word.toLowerCase());
			if (keywordToken) {
				tokenFound = true;
				this.pushToken({
					tokens: [keywordToken],
					value: word.toLowerCase(),
					pos: this.generatePos(word, word.toLowerCase()),
				});

				if (
					keywordToken === LexerToken.C_FALSE ||
					keywordToken === LexerToken.C_TRUE
				) {
					const lastIndex = this.tokens.length - 1;
					if (
						adjacentTokens(
							this.tokens[lastIndex - 1],
							this.tokens[lastIndex],
						)
					) {
						tokenFound = false;
						this.tokens.pop();
					} else {
						return true;
					}
				}
			}
		}

		if (!tokenFound) {
			tokenFound =
				this.isDigit(word) ||
				this.isHexDigit(word) ||
				this.isLetters(word);
		}

		if (!tokenFound && word.length === 1) {
			const tokens = Lexer.SINGLE_CHAR_TOKENS.get(word);
			if (tokens) {
				tokenFound = true;
				this.pushToken({
					tokens,
					value: word,
					pos: this.generatePos(word, word),
				});
				return true;
			}
		}

		if (!tokenFound) {
			tokenFound = this.isHash(word) || this.unknownToken(word);
		}

		if (!tokenFound) {
			throw new Error(
				`Lexer is not complete!!! Could not find token for "${word}"`,
			);
		}

		const token = this._tokens[this._tokens.length - 1];
		if (
			tokenFound &&
			!token?.tokens.some((t) => t === LexerToken.STRING) &&
			token &&
			token.pos.len < word.length
		) {
			return this.process(word.slice(token.pos.len));
		}

		return true;
	}

	private pushToken(token: Omit<Token, 'uri'>) {
		const fullToken: Token = {
			tokens: token.tokens,
			pos: token.pos,
			value: token.value,
			uri: this.uri,
			adjacentToken: token.adjacentToken,
		};

		const prevToken = this._tokens[this._tokens.length - 1];
		fullToken.prevToken = prevToken;

		if (prevToken) {
			prevToken.nextToken = fullToken;
		}

		this._tokens.push(fullToken);
	}

	private isLetters(word: string) {
		const firstCharCode = word[0]?.charCodeAt(0);
		// Check if first character is a letter using helper function
		if (Lexer.isLetterCode(firstCharCode)) {
			// Extract the full letter sequence using character codes
			let letterSequence = '';
			for (let i = 0; i < word.length; i++) {
				const charCode = word.charCodeAt(i);
				if (Lexer.isLetterCode(charCode)) {
					letterSequence += word[i];
				} else {
					break;
				}
			}
			this.pushToken({
				tokens: [LexerToken.LETTERS],
				value: letterSequence,
				pos: this.generatePos(word, letterSequence),
			});
			return true;
		}
		return false;
	}

	private isDigit(word: string) {
		const firstChar = word[0];
		const charCode = firstChar?.charCodeAt(0);
		// Check if first character is digit (0-9): char codes 48-57
		if (charCode >= 48 && charCode <= 57) {
			this.pushToken({
				tokens: [LexerToken.HEX, LexerToken.DIGIT],
				value: firstChar,
				pos: this.generatePos(word, firstChar),
			});
			return true;
		}
		return false;
	}

	private isHexDigit(word: string) {
		const firstChar = word[0];
		const charCode = firstChar?.charCodeAt(0);
		// Check if first character is hex letter (A-F, a-f): char codes 65-70, 97-102
		if (
			(charCode >= 65 && charCode <= 70) ||
			(charCode >= 97 && charCode <= 102)
		) {
			this.pushToken({
				tokens: [LexerToken.HEX, LexerToken.LETTERS],
				value: firstChar,
				pos: this.generatePos(word, firstChar),
			});
			return true;
		}
		return false;
	}

	private isHash(word: string) {
		const expected = '#';
		if (word.startsWith(expected)) {
			this.pushToken({
				tokens: [LexerToken.HASH],
				pos: this.generatePos(word, expected),
				value: expected,
			});
			return true;
		}
		return false;
	}

	private unknownToken(word: string) {
		this.pushToken({
			tokens: [LexerToken.UNKNOWN],
			pos: this.generatePos(word, ' '),
			value: word,
		});
		return true;
	}

	private isString(word: string) {
		if (this.inComment) return false;

		const firstChar = word[0];
		// Check if first character is a quote (double or single)
		if (firstChar === '"' || firstChar === "'") {
			const rewindLength = word.length - 1;
			if (this.columnNumber + 1 < rewindLength) {
				throw new Error('Error while rewinding');
			}
			this.columnNumber -= rewindLength;

			this.getString(firstChar);
			return true;
		}
		return false;
	}

	private generatePos(word: string, expected: string): Position {
		const col = this.columnNumber - word.length;
		const len = expected.length;
		return {
			line: this.lineNumber,
			col,
			len,
			colEnd: col + len,
		};
	}
}
