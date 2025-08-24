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
import { Node } from '../../../context/node';
import { ContextAware } from '../../../runtimeEvaluator';
import { ResolveMacroRequest } from '../../helpers';
import { dtProp } from '../../../dtMacro/macro/properties/dtProp';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';

export async function generateHoverValues(
	context: ContextAware,
	values?:
		| string
		| Node
		| NonNullable<
				boolean | (string | number | Node | undefined)[] | undefined
		  >
		| undefined,
) {
	if (!values) {
		return;
	}

	if (typeof values === 'boolean') {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: values ? '1' : '0',
			},
		};
	}

	if (typeof values === 'string') {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: values,
			},
		};
	}

	if (values instanceof Node) {
		return {
			contents: values.toMarkupContent(context.macros),
		};
	}

	if (values.length === 1 && values[0] instanceof Node) {
		return {
			contents: values[0].toMarkupContent(context.macros),
		};
	}

	if (values.every((v) => typeof v === 'number')) {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value:
					values.length === 1
						? values[0].toString()
						: `{${values.join(', ')}}`,
			},
		};
	}

	if (values.every((v) => typeof v === 'string')) {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value:
					values.length === 1
						? `"${values[0]}"`
						: `{${values.map((v) => `"${v}"`).join(', ')}}`,
			},
		};
	}

	return;
}

export async function dtPropHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	const values = await dtProp(resolveMacroRequest, dtMacroToNode);

	return generateHoverValues(resolveMacroRequest.context, values);
}
