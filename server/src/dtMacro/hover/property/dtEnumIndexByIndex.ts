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

import { MarkupKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';
import { dtEnumIndexByIndex } from '../../../dtMacro/macro/properties/dtEnumIndexByIndex';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';

export async function dtEnumIndexByIndexHover(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	const enumIdx = await dtEnumIndexByIndex(
		document,
		macro,
		context,
		position,
		dtMacroToNode,
	);

	return enumIdx
		? {
				contents: {
					kind: MarkupKind.Markdown,
					value: enumIdx.toString(),
				},
			}
		: undefined;
}
