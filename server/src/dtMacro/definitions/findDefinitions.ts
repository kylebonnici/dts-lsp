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
import { ContextAware } from '../../runtimeEvaluator';
import { getTokenizedDocumentProvider } from '../../providers/tokenizedDocument';
import { fileURLToPath } from '../../helpers';
import { findMacroDefinition, getMacroAtPosition } from '../helpers';
import { resolveDTMacroToNode } from '../dtMacroToNode';
import { generateDefinitionsFromNode } from '../../findDefinitions';

export async function getDefinitions(
	location: TextDocumentPositionParams,
	context: ContextAware,
): Promise<Location[]> {
	const filePath = fileURLToPath(location.textDocument.uri);
	const document = getTokenizedDocumentProvider().getDocument(filePath);
	const macro = getMacroAtPosition(document, location.position);

	if (!macro?.macro) {
		return [];
	}

	const node = await resolveDTMacroToNode(
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

	return getDefinitions({ ...location, position: newPosition }, context);
}
