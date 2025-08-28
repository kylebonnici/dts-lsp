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

import { Hover, MarkupKind } from 'vscode-languageserver';
import { ResolveMacroRequest } from '../../helpers';
import { dtHasChosen } from '../../../dtMacro/macro/chosen/dtHasChosen';

export async function dtHasChosenHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const hasChosen = await dtHasChosen(resolveMacroRequest);

	return hasChosen !== undefined
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: hasChosen ? '1' : '0',
				},
			}
		: undefined;
}
