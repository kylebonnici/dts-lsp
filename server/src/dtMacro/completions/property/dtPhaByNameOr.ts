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
import { ResolveMacroRequest } from '../../helpers';
import { genericPropertyCompletion } from './genericProp';
import { getCellNameCompletion } from './dtPha';
import { getNameCompletion } from './dtPhaByName';

export async function dtPhaByNameOrComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	const { macro } = resolveMacroRequest;

	if (macro.argIndexInParent === 2) {
		return getNameCompletion(resolveMacroRequest, 'DT_PHA_BY_NAME_OR');
	}

	if (macro.argIndexInParent === 3) {
		if (!macro.parent?.args?.[2]?.macro) {
			return [];
		}

		return getCellNameCompletion(
			resolveMacroRequest,
			'DT_PHA_BY_NAME_OR',
			3,
			macro.parent.args[2].macro,
		);
	}

	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_PHA_BY_NAME_OR',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
