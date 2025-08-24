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
import { dtMacroToNode } from '../../macro/dtMacroToNode';
import { dtPropLen } from '../../../dtMacro/macro/properties/dtPropLen';

export async function dtPropLenHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const length = await dtPropLen(resolveMacroRequest, dtMacroToNode);

	return length
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: length.toString(),
				},
			}
		: undefined;
}
