import { Lexer } from './lexer';
import { Parser } from './parser';

export const slxMap = new Map<string, { parser: Parser; lexer: Lexer }>();
