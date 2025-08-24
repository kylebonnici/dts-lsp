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

import { Hover, MarkupKind } from 'vscode-languageserver-types';
import { ResolveMacroRequest } from '../../../dtMacro/helpers';
import { dtCompatGetAnyStatusOk } from '../../../dtMacro/macro/node/dtCompatGetAnyStatusOk';

export async function dtCompatGetAnyStatusOkHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const nodes = await dtCompatGetAnyStatusOk(resolveMacroRequest);

	if (!nodes) {
		return;
	}

	if (!nodes?.length) {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: `No node matched compat ${resolveMacroRequest.macro.args![0].macro}`,
			},
		};
	}

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: nodes
				.map((n, i) => {
					const m = n.toMarkupContent(
						resolveMacroRequest.context.macros,
					);
					return `## Node ${i + 1}\n\n${m.value}\n`;
				})
				.join('\n\n'),
		},
	};
}
