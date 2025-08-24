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

import { CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import { ResolveMacroRequest, toCIdentifier } from '../../helpers';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { genericPropertyCompletion } from './genericProp';

export async function getCellNameCompletion(
	{ macro, document, context, position }: ResolveMacroRequest,
	macroName: string,
	cellArgIndex: number,
	mappingIndex: number | string,
) {
	if (
		macro.parent?.macro !== macroName ||
		macro.argIndexInParent !== cellArgIndex ||
		!macro.parent.args?.length
	) {
		return [];
	}

	const node = await dtMacroToNode({
		document,
		macro: macro.parent.args[0],
		context,
		position,
	});

	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === macro.parent?.args?.at(1)?.macro,
	);

	let idx = 0;
	if (typeof mappingIndex === 'string') {
		const specifierSpace = property?.nexusMapsTo.at(0)?.specifierSpace;
		const nameValues = specifierSpace
			? property.parent.getProperty(`${specifierSpace}-names`)?.ast
					.quickValues
			: undefined;

		idx =
			nameValues?.findIndex(
				(name) =>
					typeof name === 'string' &&
					name.toLowerCase() === mappingIndex,
			) ?? -1;

		if (idx === -1) {
			return [];
		}
	}

	const nexusMapping = property?.nexusMapsTo.at(idx);
	const cellNames = nexusMapping?.target.nodeType?.cellsValues?.find(
		(c) =>
			nexusMapping.specifierSpace &&
			c.specifier === nexusMapping.specifierSpace,
	);

	return (
		cellNames?.values.map(
			(cellName) =>
				({
					label: toCIdentifier(cellName),
					kind: CompletionItemKind.Property,
				}) satisfies CompletionItem,
		) ?? []
	);
}

export async function dtPhaComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	if (resolveMacroRequest.macro.argIndexInParent === 2) {
		return getCellNameCompletion(resolveMacroRequest, 'DT_PHA', 2, 0);
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PHA',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
