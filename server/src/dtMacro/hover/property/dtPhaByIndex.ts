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
import { Expression } from 'src/ast/cPreprocessors/expression';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo, toCIdentifier } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { evalExp } from '../../../helpers';

async function getPhaByIndex(
	context: ContextAware,
	idx: number | string,
	property: Property,
	cell: string,
	fallback?: string,
) {
	const nodeType = property.parent.nodeType;

	if (!nodeType || !(nodeType instanceof NodeType)) {
		return fallback;
	}

	if (typeof idx === 'string') {
		const specifierSpace = property.nexusMapsTo.at(0)?.specifierSpace;
		const nameValues = specifierSpace
			? property.parent.getProperty(`${specifierSpace}-names`)?.ast
					.quickValues
			: undefined;

		idx =
			nameValues?.findIndex(
				(name) =>
					typeof name === 'string' && name.toLowerCase() === idx,
			) ?? -1;

		if (idx === -1) {
			return fallback;
		}
	}

	const nexusMapping = property.nexusMapsTo.at(idx);
	const cellNames = nexusMapping?.target.nodeType?.cellsValues?.find(
		(c) =>
			nexusMapping.specifierSpace &&
			c.specifier === nexusMapping.specifierSpace,
	);
	const cellIndex = cellNames?.values?.indexOf(cell);

	if (cellIndex === undefined || cellIndex === -1) {
		return fallback;
	}

	const value = nexusMapping?.mappingValuesAst.at(cellIndex);

	const lastParser = (
		await (await context.getRuntime()).context.getAllParsers()
	).at(-1)!;

	if (value instanceof Expression) {
		return value.evaluate(lastParser.cPreprocessorParser.macros);
	}

	return fallback;
}

export async function dtPhaByIndex(
	document: TextDocument,
	nodeId: DTMacroInfo,
	propertyName: string,
	context: ContextAware,
	position: Position,
	idx: number | string,
	cell: string,
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

	if (!property) {
		return fallback
			? {
					contents: {
						kind: MarkupKind.Markdown,
						value: fallback.toString(),
					},
				}
			: undefined;
	}

	const enumIdx = await getPhaByIndex(context, idx, property, cell, fallback);

	return enumIdx
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: enumIdx.toString(),
				},
			}
		: undefined;
}
