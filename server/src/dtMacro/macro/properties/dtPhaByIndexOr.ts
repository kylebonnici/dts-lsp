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
import { evalExp } from '../../../helpers';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { Node } from '../../../context/node';
import { dtPhaByIndexOrRaw } from '../raw/properties/dtPhaByIndexOr';

export async function dtPhaByIndexOr(
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
	const args = macro.args;
	if (macro.macro !== 'DT_PHA_BY_IDX_OR' || args?.length !== 5) {
		return;
	}

	const node: Node | undefined = await dtMacroToNode(
		document,
		args[0],
		context,
		position,
	);

	const idx = evalExp(args[2].macro);

	if (typeof idx !== 'number') {
		return;
	}

	return dtPhaByIndexOrRaw(
		node,
		args[1].macro,
		idx,
		args[3].macro,
		args[4],
		document,
		context,
		position,
		dtMacroToNode,
	);
}
