import { DiagnosticSeverity } from 'vscode-languageserver';
import { ASTBase } from './ast/base';

export enum SyntaxIssue {
	VALUE,
	END_STATMENT,
	CURLY_OPEN,
	CURLY_CLOSE,
	OPEN_SQUARE,
	SQUARE_CLOSE,
	PROPERTY_NAME,
	NODE_NAME,
	NODE_ADDRESS,
	NODE_DEFINITION,
	PROPERTY_DEFINITION,
	NUMERIC_VALUE,
	NODE_PATH,
	NODE_REF,
	GT_SYM,
	LT_SYM,
	BYTESTRING,
	BYTESTRING_EVEN,
	DUOUBE_QUOTE,
	SINGLE_QUOTE,
	VALID_NODE_PATH,
	LABEL_NAME,
	FORWARD_SLASH_START_PATH,
	BYTESTRING_HEX,
	FORWARD_SLASH_END_DELETE,
	UNKNOWN,
	NO_STAMENTE,
	LABEL_ASSIGN_MISSING_COLON,
	DELETE_INCOMPLETE,
	NODE_PATH_WHITE_SPACE_NOT_ALLOWED,
}

export enum ContextIssues {
	DUPLICATE_PROPERTY_NAME,
	PROPERTY_DOES_NOT_EXIST,
	DUPLICATE_NODE_NAME,
	UNABLE_TO_RESOLVE_CHILD_NODE,
	LABEL_ALREADY_IN_USE,
}

export enum LexerToken {
	PROPERTY_NAME,
	LABEL_ASSIGN,
	NODE_NAME,
	OMIT_IF_NO_REF,
	ASSIGN_OPERATOR,
	SEMICOLON,
	CURLY_OPEN,
	CURLY_CLOSE,
	GT_SYM,
	LT_SYM,
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

export const tokenTypes = [
	'namespace',
	'class',
	'enum',
	'interface',
	'struct',
	'typeParameter',
	'type',
	'parameter',
	'variable',
	'property',
	'enumMember',
	'decorator',
	'event',
	'function',
	'method',
	'macro',
	'label',
	'comment',
	'string',
	'keyword',
	'number',
	'regexp',
	'operator',
] as const;

export type SemanticTokenType = (typeof tokenTypes)[number];

export const tokenModifiers = [
	'declaration',
	'definition',
	'readonly',
	'static',
	'deprecated',
	'abstract',
	'async',
	'modification',
	'documentation',
	'defaultLibrary',
] as const;

export type SemanticTokenModifiers = (typeof tokenModifiers)[number];

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

export interface TokenIndexes {
	start?: Token;
	end?: Token;
}

export type BuildSemanticTokensPush = (
	tokenType: number,
	tokenModifiers: number,
	tokenIndexes?: TokenIndexes
) => void;

export interface Issue<T extends SyntaxIssue | ContextIssues> {
	issues: T[];
	slxElement: ASTBase;
	severity: DiagnosticSeverity;
}
