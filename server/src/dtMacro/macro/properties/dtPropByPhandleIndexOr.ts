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

import { Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Node } from '../../../context/node';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { dtPropOrRaw } from '../raw/properties/dtPropOr';
import { dtPhandelByIndexRaw } from '../raw/properties/dtPhandelByIndex';

export async function dtPropByPhandleIndexOr(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
	dtMacroToNode: (
		document: TextDocument,
		macro: DTMacroInfo,
		context: ContextAware,
		position: Position,
	) => Promise<Node | undefined>,
) {
	if (
		macro.macro !== 'DT_PROP_BY_PHANDLE_IDX_OR' ||
		macro.args?.length !== 5
	) {
		return;
	}

	const handle = await dtPhandelByIndexRaw(
		await dtMacroToNode(document, macro.args[0], context, position),
		macro.args[1].macro,
		macro.args[2].macro,
	);

	return dtPropOrRaw(
		handle,
		macro.args[3].macro,
		macro.args[4],
		document,
		context,
		position,
		dtMacroToNode,
	);
}
