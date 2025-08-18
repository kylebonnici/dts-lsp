/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { MarkupKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { NodeType } from 'src/dtsTypes/types';
import { Property } from 'src/context/property';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo, toCIdentifier } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { evalExp } from '../../../helpers';

async function dtEnumIndexByIndexRaw(
	idx: number,
	property: Property,
	fallback?: string,
) {
	const value = property?.ast.quickValues?.at(idx);

	const nodeType = property.parent.nodeType;

	if (Array.isArray(value) || !nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	const propType = nodeType.properties.find((p) =>
		p.getNameMatch(property.name),
	);

	if (!propType) {
		return;
	}

	const enumIdx = propType.values(property).findIndex((v) => v === value);

	return enumIdx === -1 ? fallback : enumIdx;
}

export async function dtEnumIndexByIndex(
	document: TextDocument,
	nodeId: DTMacroInfo,
	propertyName: string,
	context: ContextAware,
	position: Position,
	idx: number | string,
	fallback?: string,
) {
	const node = await resolveDTMacroToNode(
		document,
		nodeId,
		context,
		position,
	);

	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	idx = typeof idx !== 'number' ? evalExp(idx) : idx;

	if (typeof idx !== 'number' || !property) {
		return fallback
			? {
					contents: {
						kind: MarkupKind.Markdown,
						value: fallback.toString(),
					},
				}
			: undefined;
	}

	const enumIdx = await dtEnumIndexByIndexRaw(idx, property, fallback);

	return enumIdx
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: enumIdx.toString(),
				},
			}
		: undefined;
}
