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
import { ContextAware } from '../../../runtimeEvaluator';
import { resolveDtCompatGetAnyStatusOk } from '../../dtCompatGetAnyStatusOk';

export async function dtCompatGetAnyStatusOk(
	compat: string,
	context: ContextAware,
): Promise<Hover | undefined> {
	const runtime = await context?.getRuntime();

	if (runtime) {
		const nodes = await resolveDtCompatGetAnyStatusOk(compat, context);

		if (!nodes?.length) {
			return {
				contents: {
					kind: MarkupKind.Markdown,
					value: `No node matched compat ${compat}`,
				},
			};
		}

		const lastParser = (await runtime.context.getAllParsers()).at(-1)!;

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: nodes
					.map((n, i) => {
						const m = n.toMarkupContent(
							lastParser.cPreprocessorParser.macros,
						);
						return `## Node ${i + 1}\n\n${m.value}\n`;
					})
					.join('\n\n'),
			},
		};
	}
}
