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
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { ResolveMacroRequest, toCIdentifier } from '../../helpers';
import { genericPropertyCompletion } from './genericProp';
import { getCellNameCompletion } from './dtPha';

export async function getNameCompletion(
	{ document, macro, context, position }: ResolveMacroRequest,
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

	const specifierSpace = property?.nexusMapsTo.at(0)?.specifierSpace;
	const nameValues = specifierSpace
		? property.parent.getProperty(`${specifierSpace}-names`)?.ast
				.quickValues
		: undefined;

	return (
		nameValues
			?.filter((n) => typeof n === 'string')
			?.map(
				(name) =>
					({
						label: name,
						kind: CompletionItemKind.Property,
					}) satisfies CompletionItem,
			) ?? []
	);
}

export async function dtPhaByNameComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	const { macro } = resolveMacroRequest;
	if (macro.argIndexInParent === 2) {
		return getNameCompletion(resolveMacroRequest, 'DT_PHA_BY_NAME');
	}

	if (macro.argIndexInParent === 3) {
		if (!macro.parent?.args?.[2]?.macro) {
			return [];
		}

		return getCellNameCompletion(
			resolveMacroRequest,
			'DT_PHA_BY_NAME',
			3,
			macro.parent.args[2].macro,
		);
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PHA_BY_NAME',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
