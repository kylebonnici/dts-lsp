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

import { Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
} from './helpers';
import { resolveDtAlias } from './dtAlias';
import { resolveDtChild } from './dtChild';

export async function resolveDTMacroToNode(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
): Promise<Node | undefined> {
	switch (macro.macro) {
		case 'DT_ALIAS':
			return macro.args?.[0]
				? resolveDtAlias(macro.args[0].macro, context)
				: undefined;
		case 'DT_CHILD':
			return resolveDtChild(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
	}

	const newPosition = findMacroDefinition(document, macro.macro, position);
	if (!newPosition) {
		return;
	}

	const newMacro = getMacroAtPosition(document, newPosition);
	if (!newMacro) {
		return;
	}

	return resolveDTMacroToNode(document, newMacro, context, newPosition);
}
