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
import { DtcChildNode, DtcRefNode, DtcRootNode, NodeName } from './ast/dtc/node';
import { DeleteNode } from './ast/dtc/deleteNode';
import { LabelAssign } from './ast/dtc/label';
import { NodePath } from './ast/dtc/values/nodePath';
import { Property } from './context/property';
import { LabelRef } from './ast/dtc/labelRef';
import { LabelRefValue } from './ast/dtc/values/labelRef';

const resolveNonDeletedScopedLabels = (
	node: Node,
	inScope: (ast: ASTBase) => boolean
): LabelAssign[] => {
	return [
		...node.labels.filter(inScope),
		...node.deletedNodes
			.filter((n) => !inScope(n.by))
			.flatMap((n) => resolveNonDeletedScopedLabels(n.node, inScope)),
		...node.nodes.flatMap((n) => resolveNonDeletedScopedLabels(n, inScope)),
	];
};

function getRefLabelsItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Property) ||
		!(result.ast instanceof LabelRef || result.ast instanceof LabelRefValue)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return resolveNonDeletedScopedLabels(node, inScope).filter((l) => inScope(l));
	};

	return Array.from(
		new Set(getScopeItems(result.runtime.rootNode).map((l) => l.label))
	).map((l) => ({
		label: `${l}`,
		kind: CompletionItemKind.Method,
	}));
}

function getCreateNodeRefItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (
		!result ||
		result.item !== null ||
		!(result.ast instanceof LabelRef) ||
		!(result.ast.parentNode instanceof DtcRefNode)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return resolveNonDeletedScopedLabels(node, inScope).filter((l) => inScope(l));
	};

	return Array.from(
		new Set(getScopeItems(result.runtime.rootNode).map((l) => l.label))
	).map((l) => ({
		label: `${l} {\n\t\n};`,
		kind: CompletionItemKind.Method,
	}));
}

function getDeleteNodeRefItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	const isNodeDeleteChild = (ast?: ASTBase): boolean => {
		if (!ast) return false;
		return ast instanceof DeleteNode ? true : isNodeDeleteChild(ast.parentNode);
	};

	const isRefDeleteNode = (ast?: ASTBase): boolean => {
		if (!ast) return true;
		if (
			ast.parentNode instanceof DtcRefNode ||
			ast.parentNode instanceof DtcRootNode ||
			ast.parentNode instanceof DtcChildNode
		) {
			return false;
		}
		return isRefDeleteNode(ast.parentNode);
	};

	if (
		!result ||
		result.item !== null ||
		!isNodeDeleteChild(result.ast) ||
		!isRefDeleteNode(result.ast)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return resolveNonDeletedScopedLabels(node, inScope).filter((l) => inScope(l));
	};

	if (result.ast instanceof Keyword) {
		if (getScopeItems(result.runtime.rootNode).length) {
			return [
				{
					label: '/delete-node/ ',
					kind: CompletionItemKind.Keyword,
				},
			];
		}
		return [];
	}

	return Array.from(
		new Set(getScopeItems(result.runtime.rootNode).map((l) => l.label))
	).map((l) => ({
		label: `${l};`,
		kind: CompletionItemKind.Variable,
	}));
}

function getDeleteNodeNameItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (!result || !(result.item instanceof Node) || result.item === null) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return [
			...node.nodes,
			...node.deletedNodes.filter((n) => !inScope(n.by)).map((n) => n.node),
		]
			.flatMap(
				(n) => n.definitons.filter((n) => n instanceof DtcChildNode) as DtcChildNode[]
			)
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
		return Array.from(
			new Set(getScopeItems(result.item).map((r) => r.name?.toString()))
		).map((n) => ({
			label: `${n};`,
			kind: CompletionItemKind.Variable,
		}));
	}

	return [];
}

function getDeletePropertyItems(
	result: SearchableResult | undefined,
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
		return [
			...node.properties,
			...node.deletedProperties.filter((n) => !inScope(n.by)).map((n) => n.property),
		]
			.flatMap((p) => [p, ...p.allReplaced])
			.filter((p) => inScope(p.ast));
	};

	if (result.ast instanceof Keyword) {
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

	if (result.ast instanceof PropertyName) {
		return Array.from(new Set(getSopeItems(result.item).map((p) => p.name))).map((p) => ({
			label: `${p};`,
			kind: CompletionItemKind.Variable,
		}));
	}

	return [];
}

function getNodeRefPathsItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean
): CompletionItem[] {
	if (!result || !(result.item instanceof Property) || !(result.ast instanceof NodePath)) {
		return [];
	}

	const nodePath = result.ast.pathParts.slice(0, -1).map((p) => p!.toString());

	if (nodePath.some((p) => !p)) {
		return [];
	}

	const getSopeItems = () => {
		const parentNode = result.runtime.rootNode.getChildFromScope(
			['/', ...nodePath],
			inScope
		);

		return (
			[
				...(parentNode?.nodes ?? []),
				...(parentNode?.deletedNodes.filter((n) => !inScope(n.by)).map((n) => n.node) ??
					[]),
			].map((n) => n.name) ?? []
		);
	};

	return getSopeItems().map((p) => ({
		label: `/${[...nodePath, p].join('/')}`,
		kind: CompletionItemKind.Variable,
	}));
}

export function getCompleteions(
	location: TextDocumentPositionParams,
	context: ContextAware
): CompletionItem[] {
	const meta = astMap.get(location.textDocument.uri);
	if (meta) {
		const locationMeta = context.runtime.getDeepestAstNode(
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
			...getDeleteNodeRefItems(locationMeta, inScope),
			...getNodeRefPathsItems(locationMeta, inScope),
			...getCreateNodeRefItems(locationMeta, inScope),
			...getRefLabelsItems(locationMeta, inScope),
		];
	}

	return [];
}
