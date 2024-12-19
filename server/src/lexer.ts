import { LexerToken, Position, Token } from "./types";

export class Lexer {
  inComment = false;
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
      .replace("\r\n", "\n")
      .split(/\n/)
      .map((line) => `${line}\n`);
    this.lines[this.lines.length - 1] = this.lines[this.lines.length - 1].slice(
      0,
      -1
    );
    if (text.endsWith("\n")) {
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
    return this.endOfFile
      ? null
      : this.lines[this.lineNumber].at(this.columnNumber);
  }
  static isSytaxChar(char?: string | null) {
    return (
      char === "^" ||
      char === "~" ||
      char === "|" ||
      char === "!" ||
      char === "\\" ||
      char === "<" ||
      char === ">" ||
      char === ";" ||
      char === "=" ||
      char === "/" ||
      char === "{" ||
      char === "}" ||
      char === "[" ||
      char === "]" ||
      char === "(" ||
      char === ")" ||
      char === "*" ||
      char === "%" ||
      char === "&" ||
      char === "." ||
      char === ":" ||
      char === "+" ||
      char === "@" ||
      char === "-" ||
      char === "_" ||
      char === "," ||
      char === "x" ||
      char === "?"
    );
  }
  private getWord(): string {
    let word = "";
    while (
      !this.isWhiteSpace() &&
      ((word.length && !Lexer.isSytaxChar(this.currentChar)) || !word.length)
    ) {
      word += this.currentChar ?? "";

      if (word.length === 1 && Lexer.isSytaxChar(this.currentChar)) {
        this.move();
        break;
      }

      const currLine = this.lineNumber;

      if (!this.move() || this.lineNumber !== currLine) {
        return word;
      }
    }

    if (word === "/" && this.currentChar === "*") {
      this.inComment = true;
    } else if (this.inComment && word === "*" && this.currentChar === "/") {
      this.inComment = false;
    }

    return word;
  }

  private getString(quote: string): string {
    let string = quote;
    this.numberOfEscapedCharsLastString = 0;

    while (this.currentChar !== quote) {
      string += this.currentChar ?? "";
      if (this.currentChar === "\\") {
        const prevLine = this.lineNumber;
        if (this.move()) {
          this.lineNumberOfEscapedChars++;
          this.numberOfEscapedCharsLastString++;
          if (prevLine === this.lineNumber) {
            // escaped char
            string += this.currentChar ?? "";
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
      // -----
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
      this.isCFalse(word) ||
      this.isCTrue(word) ||
      this.isDigit(word) ||
      this.isHexDigit(word) ||
      this.isLetters(word) ||
      // single char words
      this.isComma(word) ||
      this.isBitwiseNot(word) ||
      this.isBitwiseXOr(word) ||
      this.isBitwiseOr(word) ||
      this.isLogicalNot(word) ||
      this.isGtSym(word) ||
      this.isLtSym(word) ||
      this.isSemicolon(word) ||
      this.isColon(word) ||
      this.isAssignOperator(word) ||
      this.isForwardSlash(word) ||
      this.isRoundOpen(word) ||
      this.isRoundClose(word) ||
      this.isCurlyOpen(word) ||
      this.isCurlyClose(word) ||
      this.isSquareOpen(word) ||
      this.isSquareClose(word) ||
      this.isBackSlash(word) ||
      this.isMultiplicationOperator(word) ||
      this.isModulusOperator(word) ||
      this.isAmpersand(word) ||
      this.isNegeteOperator(word) ||
      this.isAddOperator(word) ||
      this.isQuestionMark(word) ||
      this.isPeriod(word) ||
      this.isHash(word) ||
      this.isUnderScore(word) ||
      this.isAt(word) ||
      this.unkownToken(word);

    if (!tokenFound) {
      throw new Error(
        `Lexer is not complete!!! Could not find token for "${word}"`
      );
    }

    const token = this._tokens.at(-1);
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

  private whiteSpace() {
    while (this.isWhiteSpace()) {
      this.move();
    }
  }

  private pushToken(token: Token) {
    token.prevToken = this._tokens.at(-1);

    const prevToken = this._tokens.at(-1);
    if (prevToken) {
      prevToken.nextToken = token;
    }

    this._tokens.push(token);
  }

  private isLetters(word: string) {
    const match = word.match(/^[A-Za-z]+/);
    if (match?.[0]) {
      this.pushToken({
        tokens: [LexerToken.LETTERS],
        value: match?.[0],
        pos: this.generatePos(word, match?.[0]),
      });
      return true;
    }
    return false;
  }

  private isDigit(word: string) {
    const match = word.match(/^[0-9]/);
    if (match?.[0]) {
      this.pushToken({
        tokens: [LexerToken.HEX, LexerToken.DIGIT],
        value: match[0],
        pos: this.generatePos(word, match[0]),
      });
      return true;
    }
    return false;
  }

  private isHexDigit(word: string) {
    const match = word.match(/^[A-Fa-f]/);
    if (match?.[0]) {
      this.pushToken({
        tokens: [LexerToken.HEX, LexerToken.LETTERS],
        value: match[0],
        pos: this.generatePos(word, match[0]),
      });
      return true;
    }
    return false;
  }

  private isCurlyOpen(word: string) {
    const expected = "{";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.CURLY_OPEN],
        pos: this.generatePos(word, expected),
        value: "{",
      });
      return true;
    }
    return false;
  }

  private isCurlyClose(word: string) {
    const expected = "}";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.CURLY_CLOSE],
        pos: this.generatePos(word, expected),
        value: "}",
      });
      return true;
    }
    return false;
  }

  private isSemicolon(word: string) {
    const expected = ";";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.SEMICOLON],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isColon(word: string) {
    const expected = ":";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.COLON],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isHash(word: string) {
    const expected = "#";
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

  private unkownToken(word: string) {
    this.pushToken({
      tokens: [LexerToken.UNKNOWN],
      pos: this.generatePos(word, " "),
      value: word,
    });
    return true;
  }

  private isAssignOperator(word: string) {
    const expected = "=";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.ASSIGN_OPERATOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isGtSym(word: string) {
    const expected = ">";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.GT_SYM],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isLtSym(word: string) {
    const expected = "<";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.LT_SYM],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isLogicalNot(word: string) {
    const expected = "!";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.LOGICAL_NOT],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isBitwiseOr(word: string) {
    const expected = "|";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.BIT_OR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isBitwiseXOr(word: string) {
    const expected = "^";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.BIT_XOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isAmpersand(word: string) {
    const expected = "&";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.AMPERSAND, LexerToken.BIT_AND],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isBitwiseNot(word: string) {
    const expected = "~";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.BIT_NOT],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isRoundOpen(word: string) {
    const expected = "(";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.ROUND_OPEN],
        pos: this.generatePos(word, expected),
        value: expected,
      });

      return true;
    }
    return false;
  }

  private isRoundClose(word: string) {
    const expected = ")";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.ROUND_CLOSE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isSquareOpen(word: string) {
    const expected = "[";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.SQUARE_OPEN],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isSquareClose(word: string) {
    const expected = "]";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.SQUARE_CLOSE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isComma(word: string) {
    const expected = ",";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.COMMA],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private rewind(word: string) {
    // word is alwase on the same line so if col < word len throw
    if (this.columnNumber + 1 < word.length) {
      throw new Error("Error while rewinding");
    }

    this.columnNumber -= word.length;
  }

  private isString(word: string) {
    if (this.inComment) return false;

    const match = word.match(/^["']/);
    if (match?.[0]) {
      // rewind to begining of string just after "
      this.rewind(word.slice(1));
      const line = this.lineNumber;
      const col = this.columnNumber;
      const string = this.getString(match[0]);
      this.pushToken({
        tokens: [LexerToken.STRING],
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
    const expected = "/";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.FORWARD_SLASH],
        pos: this.generatePos(word, expected),
        value: "/",
      });
      return true;
    }
    return false;
  }

  private isBackSlash(word: string) {
    const expected = "\\";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.BACK_SLASH],
        pos: this.generatePos(word, expected),
        value: "\\",
      });
      return true;
    }
    return false;
  }

  private isAddOperator(word: string) {
    const expected = "+";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.ADD_OPERATOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isQuestionMark(word: string) {
    const expected = "?";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.QUESTION_MARK],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isPeriod(word: string) {
    const expected = ".";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.PERIOD],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isNegeteOperator(word: string) {
    const expected = "-";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.NEG_OPERATOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isUnderScore(word: string) {
    const expected = "_";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.UNDERSCOURE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isAt(word: string) {
    const expected = "@";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.AT],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isMultiplicationOperator(word: string) {
    const expected = "*";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.MULTI_OPERATOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isModulusOperator(word: string) {
    const expected = "%";
    if (word === expected) {
      this.pushToken({
        tokens: [LexerToken.MODULUS_OPERATOR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCDefine(word: string) {
    const expected = "#define";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_DEFINE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCInclude(word: string) {
    const expected = "#include";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_INCLUDE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCLine(word: string) {
    const expected = "#line";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_LINE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCUndef(word: string) {
    const expected = "#undef";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_UNDEF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCError(word: string) {
    const expected = "#error";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_ERROR],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCPragma(word: string) {
    const expected = "#pragma";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_PRAGMA],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCDefined(word: string) {
    const expected = "#defined";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_DEFINED],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCIf(word: string) {
    const expected = "#if";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_IF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCIfDef(word: string) {
    const expected = "#ifdef";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_IFDEF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCIfNDef(word: string) {
    const expected = "#ifndef";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_IFNDEF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCElIf(word: string) {
    const expected = "#elif";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_ELIF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCElse(word: string) {
    const expected = "#else";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_ELSE],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCEndIf(word: string) {
    const expected = "#endif";
    if (word.toLowerCase() === expected) {
      this.pushToken({
        tokens: [LexerToken.C_ENDIF],
        pos: this.generatePos(word, expected),
        value: expected,
      });
      return true;
    }
    return false;
  }

  private isCTrue(word: string) {
    const expects = "true";
    if (word == expects) {
      this.pushToken({
        tokens: [LexerToken.C_TRUE],
        value: expects,
        pos: this.generatePos(word, expects),
      });
      return true;
    }
    return false;
  }

  private isCFalse(word: string) {
    const expects = "false";
    if (word == expects) {
      this.pushToken({
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
