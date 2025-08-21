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
import { DTMacroInfo, toCIdentifier } from '../../helpers';
import { evalExp } from '../../../helpers';
import { Node } from '../../../context/node';
import { dtEnumIndexByIndexOrRaw } from '../raw/properties/dtEnumIndexByIndexOr';

export async function dtEnumIndexByIndexOr(
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
	if (macro.macro !== 'DT_ENUM_IDX_BY_IDX_OR' || args?.length !== 4) {
		return;
	}

	const node: Node | undefined = await dtMacroToNode(
		document,
		args[0],
		context,
		position,
	);

	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === args[1].macro,
	);

	const idx = evalExp(args[2].macro);

	if (typeof idx !== 'number') {
		return;
	}

	return await dtEnumIndexByIndexOrRaw(
		idx,
		property,
		args[3],
		document,
		context,
		position,
		dtMacroToNode,
	);
}
