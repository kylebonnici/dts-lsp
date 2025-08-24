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

import { CompletionItem } from 'vscode-languageserver';
import { dtMacroToNode } from 'src/dtMacro/macro/dtMacroToNode';
import { ResolveMacroRequest } from '../../helpers';
import { dtPhandelByIndex } from '../../macro/properties/dtPhandelByIndex';
import { genericPropertyCompletion } from './genericProp';
import { dtPhandleByIndexComplitions } from './dtPhandleByIndex';

export async function dtPropByPhaIndexOrComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	const { macro } = resolveMacroRequest;
	if (
		(macro.argIndexInParent === 1 || macro.argIndexInParent === 2) &&
		'DT_PROP_BY_PHANDLE_IDX_OR' === macro.parent?.macro
	) {
		return dtPhandleByIndexComplitions({
			...resolveMacroRequest,
			macro: {
				...macro,
				parent: macro.parent
					? {
							...macro.parent,
							macro: 'DT_PHANDLE_BY_IDX',
						}
					: undefined,
			},
		});
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PROP_BY_PHANDLE_IDX_OR',
		3,
		5,
		undefined,
		() =>
			dtPhandelByIndex(
				{
					...resolveMacroRequest,
					macro: {
						macro: 'DT_PHANDLE_BY_IDX',
						args: macro.parent?.args?.slice(0, 3),
					},
				},
				dtMacroToNode,
			),
	);
}
