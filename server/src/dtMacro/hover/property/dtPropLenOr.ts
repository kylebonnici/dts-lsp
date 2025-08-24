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
import { dtPropLenOr } from '../../macro/properties/dtPropLenOr';
import { ResolveMacroRequest } from '../../helpers';
import { dtMacroToNode } from '../../macro/dtMacroToNode';
import { Node } from '../../../context/node';
import { generateHoverValues } from './dtProp';

export async function dtPropLenOrHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const length = await dtPropLenOr(resolveMacroRequest, dtMacroToNode);

	if (length instanceof Node) {
		return generateHoverValues(resolveMacroRequest.context, length);
	}

	return length
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: length.toString(),
				},
			}
		: undefined;
}
