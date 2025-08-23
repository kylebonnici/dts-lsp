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
	CompletionItem,
	CompletionItemKind,
	InsertTextFormat,
} from 'vscode-languageserver';
import { DTMacroInfo } from '../../helpers';
import { Runtime } from '../../../context/runtime';

export async function dtNodeLabelComplitions(
	macro: DTMacroInfo,
	runtime: Runtime,
): Promise<CompletionItem[]> {
	if (macro.macro && 'DT_NODELABEL'.startsWith(macro.macro)) {
		return [
			{
				label: `DT_NODELABEL(...)`,
				insertText: `DT_NODELABEL($1)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	if (
		macro.parent?.macro !== 'DT_NODELABEL' ||
		macro.argIndexInParent !== 0
	) {
		return [];
	}

	return await Promise.all(
		runtime.rootNode.allDescendantsLabels.map(
			async (labelAssign) =>
				({
					label: labelAssign.label.value,
					kind: CompletionItemKind.Property,
					documentation: labelAssign.lastLinkedTo?.toMarkupContent(
						runtime.context.macros,
					),
				}) satisfies CompletionItem,
		) ?? [],
	);
}
