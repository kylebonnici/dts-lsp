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
import { StringValue } from '../../../ast/dtc/values/string';
import { genericPropertyCompletion } from './genericProp';

export async function dtStringUpperTokenOrComplitions(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<CompletionItem[]> {
	return genericPropertyCompletion(
		resolveMacroRequest,
		'DT_STRING_UPPER_TOKEN_OR',
		1,
		3,
		(prop) => {
			const value = prop.ast.getFlatAstValues();
			return value?.length === 1 && value[0] instanceof StringValue;
		},
	);
}
