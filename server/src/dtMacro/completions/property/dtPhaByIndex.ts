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
import { evalExp } from '../../../helpers';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { ResolveMacroRequest, toCIdentifier } from '../../helpers';
import { genericPropertyCompletion } from './genericProp';
import { getCellNameCompletion } from './dtPha';

export async function getIndexCompletion(
	{ document, macro, position, context }: ResolveMacroRequest,
	macroName: string,
) {
	if (macro.parent?.macro !== macroName || !macro.parent.args?.length) {
		return [];
	}

	const node = await dtMacroToNode({
		document,
		macro: macro.parent.args[0],
		context,
		position,
	});

	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === macro.parent?.args?.at(1)?.macro,
	);

	return (
		Array(property?.nexusMapsTo.length ?? 0)?.map(
			(_, index) =>
				({
					label: index.toString(),
					kind: CompletionItemKind.Property,
				}) satisfies CompletionItem,
		) ?? []
	);
}

export async function dtPhaByIndexComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	if (resolveMacroRequest.macro.argIndexInParent === 2) {
		return getIndexCompletion(resolveMacroRequest, 'DT_PHA_BY_IDX');
	}

	if (resolveMacroRequest.macro.argIndexInParent === 3) {
		const idx = resolveMacroRequest.macro.parent?.args
			? evalExp(resolveMacroRequest.macro.parent.args[2].macro)
			: undefined;

		if (typeof idx !== 'number') {
			return [];
		}

		return getCellNameCompletion(
			resolveMacroRequest,
			'DT_PHA_BY_IDX',
			3,
			idx,
		);
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PHA_BY_IDX',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
