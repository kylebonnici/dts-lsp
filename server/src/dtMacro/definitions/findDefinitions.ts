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

import { Location, TextDocumentPositionParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import { findMacroDefinition, getMacroAtPosition } from '../helpers';
import { generateDefinitionsFromNode } from '../../findDefinitions';
import { dtMacroToNode } from '../macro/dtMacroToNode';

export async function getDefinitions(
	location: TextDocumentPositionParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<Location[]> {
	if (!document) return [];
	const macro = getMacroAtPosition(document, location.position);

	if (!macro?.macro) {
		return [];
	}

	const node = await dtMacroToNode(
		document,
		macro,
		context,
		location.position,
	);

	if (node) {
		return generateDefinitionsFromNode(node);
	}

	// we need to recursivly find definition
	const newPosition = findMacroDefinition(
		document,
		macro.macro,
		location.position,
	);
	if (!newPosition) {
		return [];
	}

	return getDefinitions(
		{ ...location, position: newPosition },
		context,
		document,
	);
}
