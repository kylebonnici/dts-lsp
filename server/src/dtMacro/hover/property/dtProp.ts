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

import { MarkupKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node } from 'src/context/node';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { resolveDtProp } from '../../../dtMacro/dtProp';

export async function generateHoverValues(
	context: ContextAware,
	values?: boolean | Node | (string | number | Node | undefined)[],
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

export async function dtProp(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	const values = await resolveDtProp(
		document,
		macro,
		context,
		position,
		resolveDTMacroToNode,
	);

	return generateHoverValues(context, values);
}
