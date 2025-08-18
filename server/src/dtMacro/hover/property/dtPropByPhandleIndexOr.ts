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
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { resolveDtPhandelByIndexRaw } from '../../../dtMacro/dtPhandelByIndex';
import { resolveDtPropOrRaw } from '../../../dtMacro/dtPropOr';
import { generateHoverValues } from './dtProp';

export async function dtPropByPhandleIndexOr(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	if (macro.args?.length !== 5) {
		return;
	}
	const handle = await resolveDtPhandelByIndexRaw(
		await resolveDTMacroToNode(document, macro.args[0], context, position),
		macro.args[1].macro,
		macro.args[2].macro,
	);

	const values = await resolveDtPropOrRaw(
		handle,
		macro.args[3].macro,
		macro.args[4],
		document,
		context,
		position,
		resolveDTMacroToNode,
	);

	return generateHoverValues(context, values);
}
