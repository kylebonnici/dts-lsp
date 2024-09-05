export enum LexerToken {
	PROPERTY_NAME,
	LABEL_ASSIGN,
	NODE_NAME,
	OMIT_IF_NO_REF,
	ASSIGN_OPERATOR,
	EQUAL_OPERATOR,
	GT_EQ_OPERATOR,
	LT_EQ_OPERATOR,
	NOT_EQ_OPERATOR,
	SEMICOLON,
	CURLY_OPEN,
	CURLY_CLOSE,
	GT_SYM,
	LT_SYM,
	LEFT_SHIFT,
	RIGHT_SHIFT,
	LOCAL_AND,
	LOGICAL_OR,
	LOGICAL_NOT,
	BIT_AND,
	BIT_OR,
	BIT_XOR,
	BIT_NOT,
	SQUARE_OPEN,
	SQUARE_CLOSE,
	FORWARD_SLASH,
	BACK_SLASH,
	ADD_OPERATOR,
	NEG_OPERATOR,
	MULTI_OPERATOR,
	MODULUS_OPERATOR,
	DIGITS,
	HEX,
	NUMBER,
	STRING,
	DUOUBE_QUOTE,
	SINGLE_QUOTE,
	COMMA,
	VALUE,
	// EOL,

	C_DEFINE,
	C_INCLUDE,
	C_LINE,
	C_UNDEF,
	C_ERROR,
	C_PRAGMA,

	C_DEFINED,

	C_IF,
	C_IFDEF,
	C_IFNDEF,
	C_ELIF,
	C_ELSE,
	C_ENDIF,

	C_IDENTIFIER,
	C_TRUE,
	C_FALSE,
	AMPERSAND,
	LABEL_NAME,

	UNKNOWN,
}

export interface Position {
	line: number;
	col: number;
	len: number;
}
export interface Token {
	tokens: LexerToken[];
	pos: Position;
	value?: string;
}

export class Lexer {
	lineNumber = 0;
	columnNumber = 0;
	lines: string[];
	lineNumberOfEscapedChars = 0;
	numberOfEscapedCharsLastString = 0;
	private _tokens: Token[] = [];

	get tokens() {
		return this._tokens;
	}

	constructor(private text: string) {
		this.lines = this.text
			.replace('\r\n', '\n')
			.split(/\n/)
			.map((line) => `${line}\n`);
		this.lines[this.lines.length - 1] = this.lines[this.lines.length - 1].slice(0, -1);
		if (text.endsWith('\n')) {
			this.lines.splice(-1, 1);
		}
		this.lexIt();
	}

	private isWhiteSpace() {
		return !!this.currentChar?.match(/\s/);
	}

	get endOfFile() {
		return this.isOnLastLine && this.isOnLastCharOfLine;
	}

	get isOnLastLine() {
		return this.lineNumber === this.lines.length - 1;
	}

	get isOnLastCharOfLine() {
		return this.lines[this.lineNumber].length <= this.columnNumber;
	}

	private moveToNextLine() {
		if (this.isOnLastLine) return false;

		this.columnNumber = 0;
		this.lineNumberOfEscapedChars = 0;
		this.lineNumber++;

		if (this.lines[this.lineNumber].length === 0) {
			this.moveToNextLine();
		}

		return true;
	}

	private moveOnLine() {
		if (this.isOnLastCharOfLine) {
			return this.moveToNextLine();
		}

		this.columnNumber++;

		if (this.isOnLastCharOfLine) {
			this.moveToNextLine();
		}
		return true;
	}

	private move(): boolean {
		if (this.endOfFile) return false;

		return this.moveOnLine();
	}

	private get currentChar() {
		return this.endOfFile ? null : this.lines[this.lineNumber].at(this.columnNumber);
	}
	static isSytaxChar(char?: string | null) {
		return !char?.match(/[;=/{}\\[\\]/);
	}
	private getWord(): string {
		let word = '';
		while (
			!this.isWhiteSpace() &&
			((word.length && Lexer.isSytaxChar(this.currentChar)) || !word.length)
		) {
			word += this.currentChar ?? '';
			const currLine = this.lineNumber;

			if (!this.move() || this.lineNumber !== currLine) {
				return word;
			}
		}

		return word;
	}

	private getString(quote: string): string {
		let string = quote;
		this.numberOfEscapedCharsLastString = 0;

		while (this.currentChar !== quote) {
			string += this.currentChar;
			if (this.currentChar === '\\') {
				const prevLine = this.lineNumber;
				if (this.move()) {
					this.lineNumberOfEscapedChars++;
					this.numberOfEscapedCharsLastString++;
					if (prevLine === this.lineNumber) {
						// escaped char
						string += this.currentChar;
					}
				} else {
					return string;
				}
			}

			if (!this.move()) {
				// EOF
				return string;
			}
		}

		this.move();
		string += quote;
		return string;
	}

	private lexIt() {
		while (!this.endOfFile) {
			this.whiteSpace();

			if (this.endOfFile) {
				break;
			}

			const word = this.getWord();
			if (word) {
				this.process(word);
			}
		}
	}

	private process(word: string): boolean {
		// order is important!!
		const tokenFound =
			this.isString(word) ||
			this.isCDefine(word) ||
			this.isCInclude(word) ||
			this.isCLine(word) ||
			this.isCUndef(word) ||
			this.isCError(word) ||
			this.isCPragma(word) ||
			this.isCDefined(word) ||
			this.isCIfDef(word) ||
			this.isCIfNDef(word) ||
			this.isCIf(word) ||
			this.isCElIf(word) ||
			this.isCElse(word) ||
			this.isCEndIf(word) ||
			this.isOmitIfNoRef(word) ||
			this.isLabelAssign(word) ||
			this.isCIdenttifier(word) ||
			this.isLabel(word) ||
			this.isNodeOrPropertyName(word) ||
			this.isHex(word) ||
			this.isDigits(word) ||
			this.isPropertyName(word) ||
			this.isNodeNameWithAddress(word) ||
			this.isCFalse(word) ||
			this.isCTrue(word) ||
			// 2 char words
			this.isGtEqOperator(word) ||
			this.isLtEqOperator(word) ||
			this.isNotEqOperator(word) ||
			this.isLeftShift(word) ||
			this.isRightShift(word) ||
			this.isLogicalAnd(word) ||
			this.isLogicalOr(word) ||
			this.isRightShift(word) ||
			// 1 char words
			this.isEqualOperator(word) ||
			this.isAssignOperator(word) ||
			this.isCurlyOpen(word) ||
			this.isCurlyClose(word) ||
			this.isGtSym(word) ||
			this.isLtSym(word) ||
			this.isLogicalNot(word) ||
			this.isBitwiseAnd(word) ||
			this.isBitwiseOr(word) ||
			this.isBitwiseXOr(word) ||
			this.isBitwiseNot(word) ||
			this.isSquareOpen(word) ||
			this.isSquareClose(word) ||
			this.isForwardSlash(word) ||
			this.isBackSlash(word) ||
			this.isAddOperator(word) ||
			this.isNegeteOperator(word) ||
			this.isModulusOperator(word) ||
			this.isMultiplicationOperator(word) ||
			this.isComma(word) ||
			this.isSemicolon(word) ||
			this.unkownToken(word);

		if (!tokenFound) {
			throw new Error(`Lexer is not complete!!! Could not find token for "${word}"`);
		}

		const token = this._tokens.at(-1);
		if (tokenFound && token && token.pos.len < word.length) {
			return this.process(word.slice(token.pos.len));
		}

		return true;
	}

	private whiteSpace() {
		while (this.isWhiteSpace()) {
			this.move();
		}
	}

	private isNodeOrPropertyName(word: string) {
		const match = word.match(/^[A-Za-z][A-Za-z0-9,\\._\\+-]+$/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.NODE_NAME, LexerToken.PROPERTY_NAME],
				value: match[0],
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isNodeNameWithAddress(word: string) {
		const match = word.match(/^[A-Za-z][A-Za-z0-9,\\._\\+-]+(@[0-9]*)/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.NODE_NAME],
				value: match?.[0],
				pos: this.generatePos(word, `${match?.[0]}`),
			});
			return true;
		}
		return false;
	}

	private isPropertyName(word: string) {
		const match = word.match(/^[A-Za-z0-9,\\._\\+\-?#]+$/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.PROPERTY_NAME],
				value: match[0],
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isLabel(word: string) {
		const match = word.match(/^[A-Za-z_][A-Za-z0-9_]*$/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.LABEL_NAME, LexerToken.NODE_NAME, LexerToken.PROPERTY_NAME],
				value: match?.[0],
				pos: this.generatePos(word, match?.[0]),
			});
			return true;
		}
		return false;
	}

	private isLabelAssign(word: string) {
		const match = word.match(/^[A-Za-z_][A-Za-z0-9_]*:/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.LABEL_ASSIGN],
				value: match[0].slice(0, -1),
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isHex(word: string) {
		const match = word.match(/^0x[0-9A-Fa-f]+/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.HEX, LexerToken.NUMBER, LexerToken.VALUE],
				value: match[0],
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isDigits(word: string) {
		const match = word.match(/^[0-9]+/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [LexerToken.DIGITS, LexerToken.NUMBER, LexerToken.VALUE],
				value: match[0],
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isOmitIfNoRef(word: string) {
		const expected = '/omit-if-no-ref/';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.OMIT_IF_NO_REF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isEqualOperator(word: string) {
		const expected = '==';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.EQUAL_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCurlyOpen(word: string) {
		const expected = '{';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.CURLY_OPEN],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCurlyClose(word: string) {
		const expected = '}';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.CURLY_CLOSE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isSemicolon(word: string) {
		const expected = ';';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.SEMICOLON],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private unkownToken(word: string) {
		this._tokens.push({
			tokens: [LexerToken.UNKNOWN],
			pos: this.generatePos(word, ' '),
		});
		return true;
	}

	private isAssignOperator(word: string) {
		const expected = '=';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.ASSIGN_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isGtEqOperator(word: string) {
		const expected = '>=';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.GT_EQ_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLtEqOperator(word: string) {
		const expected = '<=';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LT_EQ_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isNotEqOperator(word: string) {
		const expected = '!=';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.NOT_EQ_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isGtSym(word: string) {
		const expected = '>';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.GT_SYM],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLtSym(word: string) {
		const expected = '<';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LT_SYM],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLeftShift(word: string) {
		const expected = '<<';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LEFT_SHIFT],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isRightShift(word: string) {
		const expected = '>>';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.RIGHT_SHIFT],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLogicalAnd(word: string) {
		const expected = '&&';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LOCAL_AND],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLogicalOr(word: string) {
		const expected = '||';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LOGICAL_OR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isLogicalNot(word: string) {
		const expected = '!';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.LOGICAL_NOT],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isBitwiseAnd(word: string) {
		const expected = '&';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.BIT_AND, LexerToken.AMPERSAND],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isBitwiseOr(word: string) {
		const expected = '|';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.BIT_OR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isBitwiseXOr(word: string) {
		const expected = '^';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.BIT_XOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isBitwiseNot(word: string) {
		const expected = '~';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.BIT_NOT],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isSquareOpen(word: string) {
		const expected = '[';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.SQUARE_OPEN],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isSquareClose(word: string) {
		const expected = ']';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.SQUARE_CLOSE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isComma(word: string) {
		const expected = ',';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.COMMA],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private rewind(word: string) {
		// word is alwase on the same line so if col < word len throw
		if (this.columnNumber + 1 < word.length) {
			throw new Error('Error while rewinding');
		}

		this.columnNumber -= word.length;
	}

	private isString(word: string) {
		const match = word.match(/^["']/);
		if (match?.[0]) {
			// rewind to begining of string just after "
			this.rewind(word.slice(1));
			const line = this.lineNumber;
			const col = this.columnNumber;
			const string = this.getString(match[0]);
			this._tokens.push({
				tokens: [LexerToken.STRING, LexerToken.VALUE],
				value: string,
				pos: {
					col: col - 1, // we have already moved ....
					line,
					len: string.length + this.numberOfEscapedCharsLastString,
				},
			});

			return true;
		}
		return false;
	}

	private isForwardSlash(word: string) {
		const expected = '/';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.FORWARD_SLASH],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isBackSlash(word: string) {
		const expected = '\\';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.BACK_SLASH],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isAddOperator(word: string) {
		const expected = '+';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.ADD_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isNegeteOperator(word: string) {
		const expected = '-';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.NEG_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isMultiplicationOperator(word: string) {
		const expected = '*';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.MULTI_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isModulusOperator(word: string) {
		const expected = '%';
		if (word.startsWith(expected)) {
			this._tokens.push({
				tokens: [LexerToken.MODULUS_OPERATOR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCDefine(word: string) {
		const expected = '#define';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_DEFINE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCInclude(word: string) {
		const expected = '#include';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_INCLUDE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCLine(word: string) {
		const expected = '#line';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_LINE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCUndef(word: string) {
		const expected = '#undef';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_UNDEF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCError(word: string) {
		const expected = '#error';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_ERROR],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCPragma(word: string) {
		const expected = '#error';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_PRAGMA],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCDefined(word: string) {
		const expected = '#defined';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_DEFINED],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCIf(word: string) {
		const expected = '#if';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_IF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCIfDef(word: string) {
		const expected = '#ifdef';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_IFDEF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCIfNDef(word: string) {
		const expected = '#ifndef';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_IFNDEF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCElIf(word: string) {
		const expected = '#elif';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_ELIF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCElse(word: string) {
		const expected = '#else';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_ELSE],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCEndIf(word: string) {
		const expected = '#endif';
		if (word.toLowerCase() === expected) {
			this._tokens.push({
				tokens: [LexerToken.C_ENDIF],
				pos: this.generatePos(word, expected),
			});
			return true;
		}
		return false;
	}

	private isCIdenttifier(word: string) {
		const match = word.match(/^[A-Za-z_]+$/);
		if (match?.[0]) {
			this._tokens.push({
				tokens: [
					LexerToken.C_IDENTIFIER,
					LexerToken.LABEL_NAME,
					LexerToken.NODE_NAME,
					LexerToken.PROPERTY_NAME,
				],
				value: match[0],
				pos: this.generatePos(word, match[0]),
			});
			return true;
		}
		return false;
	}

	private isCTrue(word: string) {
		const expects = 'true';
		if (word.startsWith(expects)) {
			this._tokens.push({
				tokens: [LexerToken.C_TRUE],
				value: expects,
				pos: this.generatePos(word, expects),
			});
			return true;
		}
		return false;
	}

	private isCFalse(word: string) {
		const expects = 'false';
		if (word.startsWith(expects)) {
			this._tokens.push({
				tokens: [LexerToken.C_FALSE],
				value: expects,
				pos: this.generatePos(word, expects),
			});
			return true;
		}
		return false;
	}

	private generatePos(word: string, expected: string): Position {
		return {
			line: this.lineNumber,
			col: this.columnNumber - word.length + this.lineNumberOfEscapedChars,
			len: expected.length,
		};
	}
}
