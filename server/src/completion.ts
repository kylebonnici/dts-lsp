import {
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { astMap } from './resultCache';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { ASTBase } from './ast/base';
import { DeleteBase } from './ast/dtc/delete';
import { Keyword } from './ast/keyword';
import { PropertyName } from './ast/dtc/property';
import { NodeName } from './ast/dtc/node';

function getDeleteNodeKeyword(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.ast instanceof Keyword) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	return [
		{
			label: '/delete-node/ ',
			kind: CompletionItemKind.Keyword,
		},
	];
}

function getDeletePropertyKeyword(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		!(result.ast instanceof Keyword) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	if (
		!result.item.properties
			.flatMap((p) => [p, ...p.allReplaced])
			.filter((p) => inScope(p.ast)).length
	) {
		return [];
	}

	return [
		{
			label: '/delete-property/ ',
			kind: CompletionItemKind.Keyword,
		},
	];
}

function getDeletePropertyItems(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		!(result.ast instanceof PropertyName) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	return Array.from(
		new Set(
			result.item.properties
				.flatMap((p) => [p, ...p.allReplaced])
				.filter((p) => inScope(p.ast))
				.map((p) => p.name)
		)
	).map((p) => ({
		label: `${p};`,
		kind: CompletionItemKind.Variable,
	}));
}

function getDeleteNodeNameItems(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		!(result.ast instanceof NodeName) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	return result.item.nodes
		.flatMap((n) => n.definitons)
		.filter((n) => inScope(n))
		.map((n) => ({
			label: `${n.name?.name};`,
			kind: CompletionItemKind.Variable,
		}));
}

export function getCompleteions(
	location: TextDocumentPositionParams,
	context: ContextAware
): CompletionItem[] {
	const meta = astMap.get(location.textDocument.uri);
	if (meta) {
		const locationMeta = context.rootNode.getDeepestAstNode(
			location.textDocument.uri,
			location.position
		);

		const inScope = (ast: ASTBase) => {
			const position = location.position;
			if (ast.uri === location.textDocument.uri) {
				return !!(
					ast.tokenIndexes?.start &&
					ast.tokenIndexes?.end &&
					(ast.tokenIndexes.end.pos.line < position.line ||
						(ast.tokenIndexes.end.pos.line === position.line &&
							ast.tokenIndexes.end.pos.col + ast.tokenIndexes.end.pos.len <=
								position.character))
				);
			}

			const validFiles = context.fileMap.slice(
				0,
				context.fileMap.indexOf(location.textDocument.uri)
			);

			return validFiles.some((uri) => uri === ast.uri);
		};

		return [
			...getDeleteNodeKeyword(locationMeta, inScope),
			...getDeletePropertyKeyword(locationMeta, inScope),
			...getDeletePropertyItems(locationMeta, inScope),
			...getDeleteNodeNameItems(locationMeta, inScope),
		];
	}

	return [];
}
