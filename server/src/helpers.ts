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
