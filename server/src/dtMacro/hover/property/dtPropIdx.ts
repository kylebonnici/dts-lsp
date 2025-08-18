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
import { resolveDtPropValues } from '../../dtProp';
import { evalExp } from '../../../helpers';

export async function dtPropIdx(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	if (macro.args?.length !== 3) {
		return;
	}

	const idx = evalExp(macro.args[2].macro);

	if (typeof idx !== 'number') {
		return;
	}

	const values = await resolveDtPropValues(
		document,
		macro,
		context,
		position,
		resolveDTMacroToNode,
	);

	if (!values || !Array.isArray(values)) {
		return;
	}

	const value = values.at(idx);

	if (!value) {
		return;
	}

	if (values.length === 1 && values[0] instanceof Node) {
		return {
			contents: values[0].toMarkupContent(context.macros),
		};
	}

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: value.toString(),
		},
	};
}
