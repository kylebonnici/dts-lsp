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
import { evalExp } from 'src/helpers';
import { ResolveMacroRequest } from '../../helpers';
import { genericPropertyCompletion } from './genericProp';
import { getCellNameCompletion } from './dtPha';
import { getIndexCompletion } from './dtPhaByIndex';

export async function dtPhaByIndexOrComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	const { macro } = resolveMacroRequest;

	if (macro.argIndexInParent === 2) {
		return getIndexCompletion(resolveMacroRequest, 'DT_PHA_BY_IDX_OR');
	}
	if (macro.argIndexInParent === 3) {
		const idx = macro.parent?.args
			? evalExp(macro.parent.args[2].macro)
			: undefined;

		if (typeof idx !== 'number') {
			return [];
		}

		return getCellNameCompletion(
			resolveMacroRequest,
			'DT_PHA_BY_IDX_OR',
			3,
			idx,
		);
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PHA_BY_IDX_OR',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
