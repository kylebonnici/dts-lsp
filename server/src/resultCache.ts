import { Lexer } from './lexer';
import { Parser } from './parser';

export const astMap = new Map<string, { parser: Parser; lexer: Lexer }>();
