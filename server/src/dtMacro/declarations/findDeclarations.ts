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

import {
	Location,
	Position,
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
} from '../helpers';
import { generateNodeDeclaration } from '../../findDeclarations';
import { dtMacroToNode } from '../macro/dtMacroToNode';

export async function getDeclaration(
	location: TextDocumentPositionParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<Location | undefined> {
	if (!document) return;
	const macro = getMacroAtPosition(document, location.position);
	return getDeclarationFrom(macro, location.position, context, document);
}

async function getDeclarationFrom(
	macro: DTMacroInfo | undefined,
	position: Position,
	context: ContextAware,
	document: TextDocument,
): Promise<Location | undefined> {
	if (!macro?.macro) {
		return;
	}

	const node = await dtMacroToNode({ document, macro, context, position });

	if (node) {
		return generateNodeDeclaration(node);
	}

	const newMacro = await findMacroDefinition(
		document,
		macro.macro,
		position,
		context,
	);

	if (!newMacro) {
		return;
	}

	return getDeclarationFrom(newMacro[0], newMacro[1], context, document);
}
