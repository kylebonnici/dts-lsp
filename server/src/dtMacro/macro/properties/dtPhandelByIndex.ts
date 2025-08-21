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
import { ContextAware } from '../../../runtimeEvaluator';
import { Node } from '../../../context/node';
import { DTMacroInfo } from '../../helpers';
import { dtPhandelByIndexRaw } from '../raw/properties/dtPhandelByIndex';

export async function dtPhandelByIndex(
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
	if (macro.macro !== 'DT_PHANDLE_BY_IDX' || args?.length !== 3) {
		return;
	}

	const node = await dtMacroToNode(document, args[0], context, position);

	return dtPhandelByIndexRaw(node, args[1].macro, args.at(2)?.macro);
}
