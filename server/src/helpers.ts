import { Position } from 'vscode-languageserver';
import { ASTBase } from './ast/base';
import {
	SemanticTokenModifiers,
	SemanticTokenType,
	tokenModifiers,
	tokenTypes,
} from './types';

export const toRange = (slxBase: ASTBase) => {
	return {
		start: {
			line: slxBase.tokenIndexes?.start?.pos.line ?? 0,
			character: slxBase.tokenIndexes?.start?.pos.col ?? 0,
		},
		end: {
			line: slxBase.tokenIndexes?.end?.pos.line ?? 0,
			character:
				(slxBase.tokenIndexes?.end?.pos.col ?? 0) +
				(slxBase.tokenIndexes?.end?.pos.len ?? 0),
		},
	};
};

export const getTokenTypes = (type: SemanticTokenType) => {
	return tokenTypes.findIndex((t) => t === type);
};

export const getTokenModifiers = (type: SemanticTokenModifiers) => {
	return tokenModifiers.findIndex((t) => t === type);
};

export const positionInBetween = (
	ast: ASTBase,
	file: string,
	position: Position
): boolean => {
	return !!(
		ast.uri === file &&
		ast.tokenIndexes?.start &&
		ast.tokenIndexes?.end &&
		(ast.tokenIndexes.start.pos.line < position.line ||
			(ast.tokenIndexes.start.pos.line === position.line &&
				ast.tokenIndexes.start.pos.col <= position.character)) &&
		(ast.tokenIndexes.end.pos.line > position.line ||
			(ast.tokenIndexes.end.pos.line === position.line &&
				ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len >= position.character))
	);
};

export const getDeepestAstNodeInBetween = (
	ast: ASTBase,
	file: string,
	position: Position
) => {
	let deepestAstNode: ASTBase | undefined = ast;
	let next: ASTBase | undefined = ast;
	while (next) {
		deepestAstNode = next;
		next = deepestAstNode.children
			.reverse()
			.find((c) => positionInBetween(c, file, position));
	}
	return deepestAstNode;
};
