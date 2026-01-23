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

import { readFileSync } from 'fs';
import { basename } from 'path';
import {
	Location,
	Position,
	Range,
	TypeDefinitionParams,
} from 'vscode-languageserver';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { NodeName } from './ast/dtc/node';
import { Label } from './ast/dtc/label';
import { LabelRef } from './ast/dtc/labelRef';
import { nodeFinder, pathToFileURL } from './helpers';
import { isDeleteChild } from './ast/helpers';
import { PropertyName } from './ast/dtc/property';
import { Property } from './context/property';
import { NodeType } from './dtsTypes/types';
import { ZephyrBindingYml } from './types/index';

function getNodeTypeDefinition(
	result: SearchableResult | undefined,
): Location[] {
	if (
		!result ||
		(!(result.ast instanceof NodeName) && !(result.ast instanceof Label))
	) {
		return [];
	}

	const gentItem = (node: Node) => {
		if (!node.nodeType?.bindingsPath) {
			return [];
		}
		return [
			Location.create(
				pathToFileURL(node.nodeType.bindingsPath),
				Range.create(Position.create(0, 0), Position.create(0, 0)),
			),
		];
	};
	if (result.item instanceof Node && !isDeleteChild(result.ast)) {
		return gentItem(result.item);
	}

	if (
		result.ast instanceof Label &&
		result.ast.parentNode instanceof LabelRef
	) {
		if (result.ast.parentNode.linksTo) {
			return gentItem(result.ast.parentNode.linksTo);
		}
	}

	if (result.ast instanceof NodeName) {
		if (result.ast.linksTo) {
			return gentItem(result.ast.linksTo);
		}
	}

	return [];
}

function getPropertyTypeDefinition(
	result: SearchableResult | undefined,
): Location[] {
	if (
		!result ||
		!(result.item instanceof Property) ||
		!(result.ast instanceof PropertyName) ||
		result.runtime.context.bindingLoader?.type !== 'Zephyr'
	) {
		return [];
	}

	const node = result.item.parent;

	const binding =
		node.nodeType instanceof NodeType
			? node.nodeType.zephyrBinding
			: undefined;

	if (!binding) {
		return [];
	}

	const rootRange = findPropInFile(result.ast.name, binding);
	if (rootRange) {
		return [Location.create(pathToFileURL(binding.filePath), rootRange)];
	}

	const extendsBindings = (
		result.runtime.context.bindingLoader?.getZephyrContextBinding?.() ?? []
	).filter((b) =>
		binding.extends?.some((bb) => basename(b.filePath) === `${bb}.yaml`),
	);

	for (const extBinding of extendsBindings) {
		const r = findPropInFile(result.ast.name, extBinding);
		if (r) {
			return [Location.create(pathToFileURL(extBinding.filePath), r)];
		}
	}

	return [
		Location.create(
			pathToFileURL(binding.filePath),
			Range.create(Position.create(0, 0), Position.create(0, 0)),
		),
	];
}

export async function typeDefinition(
	location: TypeDefinitionParams,
	context?: ContextAware,
): Promise<Location[]> {
	return nodeFinder(location, context, (locationMeta) => [
		...getNodeTypeDefinition(locationMeta),
		...getPropertyTypeDefinition(locationMeta),
	]);
}

function findPropInFile(
	propertyName: string,
	binding: ZephyrBindingYml,
): Range | undefined {
	const typeFile = binding.filePath;
	const text = readFileSync(typeFile, 'utf8');
	return getLocation(
		text,
		new RegExp(`(${propertyName}|"${propertyName}")\\s*:`),
	);
}

function getLocation(text: string, regex: RegExp) {
	const match = text.match(regex);
	if (!match) return;

	const index = match.index;
	if (index === undefined) return;
	const before = text.slice(0, index);

	const line = before.split('\n').length - 1;

	const lastNewline = before.lastIndexOf('\n');
	const startCol = lastNewline === -1 ? index + 1 : index - lastNewline;

	const endCol = startCol + match[0].length;

	return Range.create(
		Position.create(line, startCol),
		Position.create(line, endCol),
	);
}
