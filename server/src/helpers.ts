import {
	DiagnosticSeverity,
	DiagnosticTag,
	Position,
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { ASTBase } from './ast/base';
import {
	Issue,
	IssueTypes,
	SearchableResult,
	SemanticTokenModifiers,
	SemanticTokenType,
	Token,
	tokenModifiers,
	tokenTypes,
} from './types';
import { ContextAware } from './runtimeEvaluator';
import { astMap } from './resultCache';

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

export const isLastTokenOnLine = (
	tokens: Token[] | undefined,
	ast: ASTBase,
	position: Position
) => {
	if (!tokens) {
		return false;
	}
	const lineTokens = tokens.filter((t) => t.pos.line === position.line);
	const lastLineToken = lineTokens.at(-1);
	if (lastLineToken && lastLineToken.pos.col >= position.character) return false; // we should have matched positionInBetween
	return ast.tokenIndexes?.end === lastLineToken;
};

export const getDeepestAstNodeInBetween = (
	ast: ASTBase,
	previousFiles: string[],
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

export const genIssue = <T extends IssueTypes>(
	issue: T | T[],
	slxBase: ASTBase,
	severity: DiagnosticSeverity = DiagnosticSeverity.Error,
	linkedTo: ASTBase[] = [],
	tags: DiagnosticTag[] | undefined = undefined,
	templateStrings: string[] = []
): Issue<T> => ({
	issues: Array.isArray(issue) ? issue : [issue],
	astElement: slxBase,
	severity,
	linkedTo,
	tags,
	templateStrings,
});

export const sortAstForScope = (ast: ASTBase[], fileOrder: string[]) => {
	return ast.sort((a, b) => {
		const aFileIndex = fileOrder.findIndex((f) => a.uri);
		const bFileIndex = fileOrder.findIndex((f) => b.uri);

		if (aFileIndex !== bFileIndex) {
			return aFileIndex - bFileIndex;
		}

		if (!a.tokenIndexes?.end || !b.tokenIndexes?.end) {
			throw new Error('Must have token indexes');
		}

		if (a.tokenIndexes.end.pos.line !== b.tokenIndexes.end.pos.line) {
			return a.tokenIndexes.end.pos.line - b.tokenIndexes.end.pos.line;
		}

		return a.tokenIndexes.end.pos.col - b.tokenIndexes.end.pos.col;
	});
};

export function nodeFinder<T>(
	location: TextDocumentPositionParams,
	context: ContextAware,
	action: (result: SearchableResult | undefined, inScope: (ast: ASTBase) => boolean) => T[]
): T[] {
	const uri = location.textDocument.uri.replace('file://', '');
	const meta = astMap.get(uri);
	if (meta) {
		console.time('search');
		const locationMeta = context.runtime.getDeepestAstNode(
			context.contextFiles().slice(0, context.contextFiles().indexOf(uri)),
			uri,
			location.position
		);
		console.timeEnd('search');

		const inScope = (ast: ASTBase) => {
			const position = location.position;
			if (ast.uri === uri) {
				return !!(
					ast.tokenIndexes?.end &&
					(ast.tokenIndexes.end.pos.line < position.line ||
						(ast.tokenIndexes.end.pos.line === position.line &&
							ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len <=
								position.character))
				);
			}

			const contextFiles = context.contextFiles();
			const validFiles = contextFiles.slice(0, contextFiles.indexOf(uri) + 1);

			return validFiles.some((uri) => uri === ast.uri);
		};

		return action(locationMeta, inScope);
	}

	return [];
}
