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

import {
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextEdit,
} from 'vscode-languageserver';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { DtcProperty, PropertyName } from './ast/dtc/property';
import { Property } from './context/property';
import {
	generateAddMissingPropEdit,
	getClosestAstNode,
	nodeFinder,
} from './helpers';
import { isChildOfAstNode, isDeleteChild } from './ast/helpers';
import { NodeType } from './dtsTypes/types';
import { ASTBase } from './ast/base';
import { PropertyValue } from './ast/dtc/values/value';
import { DeleteBase } from './ast/dtc/delete';
import { ZephyrTypeToDTSType } from './dtsTypes/bindings/zephyr/loader';

const propertyValue = (astBase?: ASTBase): boolean => {
	if (!astBase || astBase instanceof DtcProperty) return false;

	return (
		astBase instanceof PropertyValue || propertyValue(astBase.parentNode)
	);
};

function getPropertyAssignItems(
	result: SearchableResult | undefined,
): CompletionItem[] {
	if (
		!result ||
		!(
			result.item instanceof Property &&
			result.item.ast.assignOperatorToken
		)
	) {
		return [];
	}

	const inPropertyValue = propertyValue(result?.ast);

	if (
		!inPropertyValue &&
		!(
			result.ast instanceof DtcProperty && result.item.ast.values === null
		) &&
		!propertyValue(result.beforeAst) &&
		!propertyValue(result.afterAst)
	) {
		return [];
	}

	let valueIndex = -1;

	if (result.item.ast.values === null) {
		valueIndex = 0;
	} else {
		valueIndex =
			(result.item.ast.values?.values.findIndex(
				(v) => v && isChildOfAstNode(v, result.beforeAst),
			) ?? -1) + 1;
	}

	if (valueIndex === -1) {
		valueIndex = 0;
	}

	if (result.item.name === 'compatible') {
		const nodeTypes = result.item.parent.nodeTypes.filter((t) => t);
		const nodeType = nodeTypes.at(-1);
		const currentBindings = result.item.ast.quickValues;
		let bindings: string[] | undefined;
		if (
			currentBindings?.some((b) => b) &&
			nodeType instanceof NodeType &&
			nodeType.extends.size
		) {
			bindings = Array.from(nodeType.extends).filter(
				(v) => !currentBindings || !currentBindings.includes(v),
			);
		}

		if (currentBindings?.filter((v) => v)?.length && !bindings) {
			return [];
		}

		bindings ??= result.runtime.context.bindingLoader?.getBindings() ?? [];

		return bindings
			.filter((v) => !currentBindings || !currentBindings.includes(v))
			.map((v) => {
				let missingPropertiesEdits: TextEdit[] = [];

				const astNode = getClosestAstNode(result.ast);
				if (
					astNode &&
					result.item?.parent &&
					result.runtime.context.bindingLoader?.type === 'Zephyr'
				) {
					const node = result.item.parent;
					const zephyrBinding = result.runtime.context.bindingLoader
						.getZephyrContextBinding()
						?.find((b) => b.compatible === v);
					const requiredProps = Object.values(
						zephyrBinding?.properties ?? {},
					).filter((prop) => prop.required);

					const missingProperties = requiredProps.filter((r) =>
						result.item?.parent?.properties.every(
							(p) => p.name !== r.name,
						),
					);

					missingProperties.forEach((prop) => {
						const type = ZephyrTypeToDTSType(prop.type)[0];

						const edit = generateAddMissingPropEdit(
							node,
							astNode,
							prop.name,
							type,
							result.runtime,
						);

						if (edit) {
							missingPropertiesEdits.push(edit);
						}
					});
				}

				return {
					label: `"${v}"`,
					documentation:
						result.runtime.context.bindingLoader?.getBindingDocumentation(
							v,
						),
					textEdit: TextEdit.replace(result.ast.range, `"${v}"`),
					additionalTextEdits: missingPropertiesEdits,
					kind: CompletionItemKind.Variable,
					insertText: inPropertyValue ? v : `"${v}"`,
				};
			});
	}

	const nodeType = result.item.parent.nodeType;
	if (nodeType instanceof NodeType) {
		return (
			nodeType.properties
				.find((p) => p.name === result.item?.name)
				?.getPropertyCompletionItems(
					result.item,
					valueIndex,
					inPropertyValue,
				) ?? []
		);
	}

	return [];
}

function getPropertyNamesItems(
	result: SearchableResult | undefined,
): CompletionItem[] {
	if (
		!result ||
		!(
			(result.item instanceof Property &&
				result.ast instanceof PropertyName &&
				result.item.ast.values == null) ||
			result.item instanceof Node
		) ||
		isDeleteChild(result.ast) ||
		result.beforeAst?.parentNode instanceof DeleteBase
	) {
		return [];
	}

	const getItems = (node: Node) =>
		node.nodeType?.getPropertyListCompletionItems(node) ?? [];

	if (result.item instanceof Property) {
		return getItems(result.item.parent);
	}

	return getItems(result.item);
}

export async function getTypeCompletions(
	location: TextDocumentPositionParams,
	context: ContextAware | undefined,
): Promise<CompletionItem[]> {
	return nodeFinder(location, context, (locationMeta) => [
		...getPropertyAssignItems(locationMeta),
		...getPropertyNamesItems(locationMeta),
	]);
}
