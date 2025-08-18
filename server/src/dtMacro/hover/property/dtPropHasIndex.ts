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
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { resolveDtPropRaw } from '../../dtProp';
import { Node } from '../../../context/node';
import { evalExp } from '../../../helpers';

export async function dtPropHasIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: number | string,
	context: ContextAware,
) {
	const values = await resolveDtPropRaw(node, propertyName, context);

	if (values === undefined) {
		return false;
	}

	idx = typeof idx === 'number' ? idx : evalExp(idx ?? '0');

	if (typeof idx !== 'number') {
		return;
	}

	if (Array.isArray(values)) {
		return values.length < idx;
	}

	return idx === 0;
}

export async function dtPropHasIndex(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	const args = macro.args;
	if (macro.macro !== 'DT_PROP_HAS_IDX' || args?.length !== 3) return;

	const values = await dtPropHasIndexRaw(
		await resolveDTMacroToNode(document, args[0], context, position),
		args[1].macro,
		args[2].macro,
		context,
	);

	if (values === undefined) {
		return;
	}

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: values ? '1' : '0',
		},
	};
}
