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

export function dtSameNodeComplitions(macro: DTMacroInfo): CompletionItem[] {
	if (macro.macro && macro.macro && 'DT_SAME_NODE'.startsWith(macro.macro)) {
		return [
			{
				label: `DT_SAME_NODE(...)`,
				insertText: `DT_SAME_NODE($1, $2)`,
				kind: CompletionItemKind.Snippet,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}
	return [];
}
