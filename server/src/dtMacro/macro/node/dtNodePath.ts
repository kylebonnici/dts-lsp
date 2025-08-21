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
import { DTMacroInfo } from '../../helpers';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { dtNodePathRaw } from '../raw/node/dtNodePath';

export async function dtNodePath(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	if (macro.macro !== 'DT_NODE_PATH' || macro.args?.length !== 1) {
		return;
	}

	const node = await dtMacroToNode(
		document,
		macro.args[0],
		context,
		position,
	);

	return dtNodePathRaw(node);
}
