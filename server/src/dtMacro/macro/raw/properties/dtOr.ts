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
import { ContextAware } from '../../../../runtimeEvaluator';
import { Node } from '../../../../context/node';
import { DTMacroInfo } from '../../../helpers';

export async function dtOrRaw<T>(
	v: T,
	fallback: DTMacroInfo,
	document: TextDocument,
	context: ContextAware,
	position: Position,
	dtMacroToNode: (
		document: TextDocument,
		macro: DTMacroInfo,
		context: ContextAware,
		position: Position,
	) => Promise<Node | undefined>,
) {
	if (!v) {
		const node = await dtMacroToNode(document, fallback, context, position);
		return node
			? dtMacroToNode(document, fallback, context, position)
			: fallback.macro;
	}

	return v;
}
