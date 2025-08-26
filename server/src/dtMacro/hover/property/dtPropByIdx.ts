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
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { ResolveMacroRequest } from '../../helpers';
import { dtPropByIndex } from '../../macro/properties/dtPropByIndex';
import { Node } from '../../../context/node';

export async function dtPropByIdxHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const value = await dtPropByIndex(resolveMacroRequest, dtMacroToNode);

	if (value === true) {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: '1',
			},
		};
	}

	if (!value) {
		return;
	}

	if (value instanceof Node) {
		return {
			contents: value.toMarkupContent(resolveMacroRequest.context.macros),
		};
	}

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: value.toString(),
		},
	};
}
