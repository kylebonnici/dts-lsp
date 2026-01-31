/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readdirSync } from 'fs';
import { dirname, join, relative } from 'path';
import {
	CompletionItem,
	CompletionItemKind,
	InsertTextFormat,
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { ASTBase } from './ast/base';
import { Keyword } from './ast/keyword';
import { DtcProperty, PropertyName } from './ast/dtc/property';
import {
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
	NodeName,
} from './ast/dtc/node';
import { DeleteNode } from './ast/dtc/deleteNode';
import { LabelAssign } from './ast/dtc/label';
import { NodePath } from './ast/dtc/values/nodePath';
import { Property } from './context/property';
import { LabelRef } from './ast/dtc/labelRef';
import { nodeFinder } from './helpers';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { isDeleteChild, isPropertyValueChild } from './ast/helpers';
import { IncludePath } from './ast/cPreprocessors/include';
import { DeleteBase } from './ast/dtc/delete';
import { NodeType } from './dtsTypes/types';
import { FunctionDefinition } from './ast/cPreprocessors/functionDefinition';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { StringValue } from './ast/dtc/values/string';

function getIncludePathItems(
	result: SearchableResult | undefined,
): CompletionItem[] {
	if (!result || !(result.ast instanceof IncludePath)) {
		return [];
	}

	const getItems = (paths: string[]) => {
		return paths.flatMap((p) => {
			try {
				return readdirSync(p, { withFileTypes: true, recursive: true })
					.filter((f) => {
						return (
							f.name.toLowerCase().endsWith('.dtsi') ||
							f.name.toLowerCase().endsWith('.h')
						);
					})
					.map((f) => ({
						label: `${join(relative(p, f.parentPath), f.name)}`,
						kind: CompletionItemKind.File,
					}));
			} catch {
				return [];
			}
		});
	};

	if (result.ast.relative) {
		return getItems([dirname(result.ast.uri)]);
	}

	const includePaths = result.runtime.context.settings.includePaths ?? [];

	return getItems(includePaths);
}

const resolveNonDeletedScopedLabels = (
	node: Node,
	inScope: (ast: ASTBase) => boolean,
): LabelAssign[] => {
	return [
		...node.labels.filter(inScope),
		...node.deletedNodes
			.filter((n) => !inScope(n.by))
			.flatMap((n) => resolveNonDeletedScopedLabels(n.node, inScope)),
		...node.nodes.flatMap((n) => resolveNonDeletedScopedLabels(n, inScope)),
	];
};

const resolveNonDeletedLabels = (
	node: Node,
	inScope: (ast: ASTBase) => boolean,
): LabelAssign[] => {
	return [
		...node.labels,
		...node.deletedNodes
			.filter((n) => !inScope(n.by))
			.flatMap((n) => resolveNonDeletedLabels(n.node, inScope)),
		...node.nodes.flatMap((n) => resolveNonDeletedLabels(n, inScope)),
	];
};

function getRefLabelsItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Property) ||
		!(result.ast instanceof LabelRef)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return resolveNonDeletedLabels(node, inScope);
	};

	const map = new Map<string, LabelAssign>();
	getScopeItems(result.runtime.rootNode).forEach((l) =>
		map.set(l.label.value, l),
	);

	return Array.from(map).map(([, l]) => ({
		label: `${l.label.value}`,
		kind: CompletionItemKind.Method,
		documentation: l.lastLinkedTo?.toMarkupContent(
			result.runtime.context.macros,
		),
	}));
}

function getCreateNodeRefItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
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
		return resolveNonDeletedScopedLabels(node, inScope).filter((l) =>
			inScope(l),
		);
	};

	return [
		...Array.from(
			new Set(
				getScopeItems(result.runtime.rootNode).map(
					(l) => l.label.value,
				),
			),
		).map((l) => ({
			label: l,
			insertText:
				result.ast.lastToken.nextToken?.value === '{'
					? l
					: `${l} {\n\t$1\n};`,
			kind: CompletionItemKind.Value,
			insertTextFormat: InsertTextFormat.Snippet,
		})),
	];
}

function getDeleteNodeRefItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
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
		!isDeleteChild(result.ast) ||
		!isRefDeleteNode(result.ast)
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return resolveNonDeletedScopedLabels(node, inScope).filter((l) =>
			inScope(l),
		);
	};

	if (result.ast instanceof Keyword) {
		if (getScopeItems(result.runtime.rootNode).length) {
			return [
				{
					label: '/delete-node/',
					insertText: `/delete-node/ $1;`,
					kind: CompletionItemKind.Keyword,
					insertTextFormat: InsertTextFormat.Snippet,
					sortText: '~',
					command: {
						command: 'editor.action.triggerSuggest',
						title: 'Re-trigger suggestions',
					},
				},
			];
		}

		if (result.runtime.rootNode.nodes.length) {
			return [
				{
					label: '/delete-node/ &{}',
					insertText: `/delete-node/ {/$1};`,
					kind: CompletionItemKind.Keyword,
					insertTextFormat: InsertTextFormat.Snippet,
					sortText: '~',
					command: {
						command: 'editor.action.triggerSuggest',
						title: 'Re-trigger suggestions',
					},
				},
			];
		}

		return [];
	}

	const map = new Map<string, LabelAssign>();
	getScopeItems(result.runtime.rootNode).forEach((l) =>
		map.set(l.label.value, l),
	);

	return Array.from(map).map(([, l]) => ({
		label:
			result.ast instanceof LabelRef
				? `${l.label.value}`
				: `&${l.label.value}`,
		kind: CompletionItemKind.Variable,
		documentation: l.lastLinkedTo?.toMarkupContent(
			result.runtime.context.macros,
		),
	}));
}

function getDeleteNodeNameItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		result.item === null ||
		(result.beforeAst &&
			(!(result.beforeAst?.parentNode instanceof DeleteBase) ||
				result.beforeAst?.parentNode instanceof DeleteProperty))
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return [
			...node.nodes,
			...node.deletedNodes
				.filter((n) => !inScope(n.by))
				.map((n) => n.node),
		]
			.flatMap((node) => ({
				node,
				astNodes: node.definitions.filter(
					(n) => n instanceof DtcChildNode,
				),
			}))
			.filter((n) => n.astNodes.some(inScope));
	};

	if (
		result.ast instanceof NodeName ||
		result.ast instanceof DeleteNode ||
		result.beforeAst?.parentNode instanceof DeleteNode
	) {
		return getScopeItems(result.item).map((n) => ({
			label: `${n.astNodes.at(0)?.name?.toString()}`,
			kind: CompletionItemKind.Variable,
			documentation: n.node.toMarkupContent(
				result.runtime.context.macros,
			),
		}));
	}

	if (getScopeItems(result.item).length) {
		return [
			{
				label: '/delete-node/',
				insertText: `/delete-node/ $1;`,
				kind: CompletionItemKind.Keyword,
				insertTextFormat: InsertTextFormat.Snippet,
				sortText: '~',
				command: {
					command: 'editor.action.triggerSuggest',
					title: 'Re-trigger suggestions',
				},
			},
		];
	}
	return [];
}

function getDeletePropertyItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
	if (
		!result ||
		!(result.item instanceof Node) ||
		(result.beforeAst &&
			(!(result.beforeAst?.parentNode instanceof DeleteBase) ||
				result.beforeAst?.parentNode instanceof DeleteNode))
	) {
		return [];
	}

	const getScopeItems = (node: Node) => {
		return [
			...node.properties,
			...node.deletedProperties
				.filter((n) => !inScope(n.by))
				.map((n) => n.property),
		]
			.flatMap((p) => [p, ...p.allReplaced])
			.filter((p) => inScope(p.ast));
	};

	if (
		result.ast instanceof PropertyName ||
		result.ast instanceof DeleteProperty ||
		result.beforeAst?.parentNode instanceof DeleteProperty
	) {
		const map = new Map<string, Property>();
		getScopeItems(result.item).forEach((p) => map.set(p.name, p));

		return Array.from(map).map(([, p]) => ({
			label: `${p.name}`,
			kind: CompletionItemKind.Variable,
			documentation: p.ast.toPrettyString(result.runtime.context.macros),
		}));
	}

	if (getScopeItems(result.item).length) {
		return [
			{
				label: '/delete-property/',
				insertText: `/delete-property/ $1;`,
				kind: CompletionItemKind.Keyword,
				sortText: '~',
				insertTextFormat: InsertTextFormat.Snippet,
				command: {
					command: 'editor.action.triggerSuggest',
					title: 'Re-trigger suggestions',
				},
			},
		];
	}
	return [];
}

function getNodeRefPathsItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
	const nodePathObj: ASTBase | undefined =
		result?.ast instanceof NodePath ? result.ast : result?.ast.parentNode;

	if (!result || !nodePathObj || !(nodePathObj instanceof NodePath)) {
		return [];
	}
	const nodePathTemp = nodePathObj.pathParts.slice(0, -1);

	if (nodePathTemp.some((p) => !p)) {
		return [];
	}

	const nodePath = (nodePathTemp as NodeName[]).map((p) => p.toString());

	const getScopeItems = () => {
		const parentNode = result.runtime.rootNode.getChildFromScope(
			['/', ...nodePath],
			inScope,
		);

		return [
			...(parentNode?.nodes.filter(
				(n) =>
					!isDeleteChild(result.ast) || n.definitions.some(inScope),
			) ?? []),
			...(parentNode?.deletedNodes
				.filter((n) => !inScope(n.by))
				.map((n) => n.node) ?? []),
		];
	};

	return getScopeItems().map((node) => ({
		label: `/${[...nodePath, node.fullName].join('/')}`,
		kind: CompletionItemKind.Variable,
		documentation: node.toMarkupContent(result.runtime.context.macros),
	}));
}

function getPropertyAssignMacroItems(
	result: SearchableResult | undefined,
): CompletionItem[] {
	if (
		!result ||
		!(
			result.item instanceof Property &&
			result.item.ast.assignOperatorToken
		) ||
		result.ast instanceof StringValue
	) {
		return [];
	}

	const inPropertyValue = isPropertyValueChild(result?.ast);

	if (
		!inPropertyValue &&
		!(
			result.ast instanceof DtcProperty && result.item.ast.values === null
		) &&
		!isPropertyValueChild(result.beforeAst) &&
		!isPropertyValueChild(result.afterAst)
	) {
		return [];
	}

	const nodeType = result.item.parent.nodeType;
	if (nodeType instanceof NodeType) {
		return Array.from(
			[
				result.runtime.context.parser,
				...result.runtime.context.overlayParsers,
			].at(-1)?.cPreprocessorParser.macros ?? [],
		).map(([, v]) => {
			if (v.macro.identifier instanceof FunctionDefinition) {
				return {
					label: `${v.macro.identifier.toString()}`,
					insertText: `${v.macro.name}(${v.macro.identifier.params
						.map((p, i) =>
							p instanceof CIdentifier ? `$${i + 1}` : '',
						)
						.join(', ')})`,
					kind: CompletionItemKind.Function,
					sortText: `~${v.macro.name}`,
					insertTextFormat: InsertTextFormat.Snippet,
				};
			}
			return {
				label: v.macro.identifier.name,
				kind: CompletionItemKind.Variable,
				sortText: `~${v.macro.name}`,
			};
		});
	}

	return [];
}

function getNodeChildNameItems(
	result: SearchableResult | undefined,
	inScope: (ast: ASTBase) => boolean,
): CompletionItem[] {
	if (
		!result?.item ||
		!(
			(result.ast instanceof PropertyName &&
				result.ast.parentNode instanceof DtcProperty) ||
			result.ast instanceof DtcRootNode
		)
	) {
		return [];
	}

	const node = result.item instanceof Node ? result.item : result.item.parent;

	return node.nodes
		.filter((d) => {
			const def = d.definitions.at(-1);
			return def && inScope(def);
		})
		.map((d) => d.name?.toString())
		.filter((n) => n)
		.map((n) => ({
			label: `${n}`,
			insertText: `${n} {\n\t$1\n};`,
			kind: CompletionItemKind.Class,
			sortText: `!${n}`, // sort top
			insertTextFormat: InsertTextFormat.Snippet,
		}));
}

export async function getCompletions(
	location: TextDocumentPositionParams,
	context: ContextAware | undefined,
): Promise<CompletionItem[]> {
	return nodeFinder(location, context, (locationMeta, inScope) => [
		...getDeletePropertyItems(locationMeta, inScope),
		...getDeleteNodeNameItems(locationMeta, inScope),
		...getDeleteNodeRefItems(locationMeta, inScope),
		...getNodeRefPathsItems(locationMeta, inScope),
		...getCreateNodeRefItems(locationMeta, inScope),
		...getRefLabelsItems(locationMeta, inScope),
		...getIncludePathItems(locationMeta),
		...getPropertyAssignMacroItems(locationMeta),
		...getNodeChildNameItems(locationMeta, inScope),
	]);
}
