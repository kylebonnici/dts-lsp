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

function getDeleteNodeNameItems(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return [
			...node.nodes,
			...node.deletedNodes.filter((n) => inScope(n.by)).map((n) => n.node),
		]
			.flatMap((n) => n.definitons)
			.filter((n) => inScope(n));
	};

	if (result.ast instanceof Keyword) {
		if (getScopeItems(result.item).length) {
			return [
				{
					label: '/delete-node/ ',
					kind: CompletionItemKind.Keyword,
				},
			];
		}
		return [];
	}

	if (result.ast instanceof NodeName) {
		return getScopeItems(result.item).map((n) => ({
			label: `${n.name?.name};`,
			kind: CompletionItemKind.Variable,
		}));
	}

	return [];
}

function getDeletePropertyItems(
	result: SearchableResult,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		!(result.ast.parentNode instanceof DeleteBase)
	) {
		return [];
	}

	const getSopeItems = (node: Node) => {
		return node.properties
			.flatMap((p) => [p, ...p.allReplaced])
			.filter((p) => inScope(p.ast));
	};

	if (result.ast instanceof PropertyName) {
		if (getSopeItems(result.item).length) {
			return [
				{
					label: '/delete-property/ ',
					kind: CompletionItemKind.Keyword,
				},
			];
		}
		return [];
	}

	if (result.ast instanceof NodeName) {
		return Array.from(new Set(getSopeItems(result.item).map((p) => p.name))).map((p) => ({
			label: `${p};`,
			kind: CompletionItemKind.Variable,
		}));
	}

	return [];
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
			...getDeletePropertyItems(locationMeta, inScope),
			...getDeleteNodeNameItems(locationMeta, inScope),
		];
	}

	return [];
}
