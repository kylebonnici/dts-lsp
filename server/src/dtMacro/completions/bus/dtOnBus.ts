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
import { ResolveMacroRequest } from '../../helpers';

export async function dtOnBusComplitions({
	macro,
	context,
}: ResolveMacroRequest): Promise<CompletionItem[]> {
	if (macro.parent?.macro === 'DT_ON_BUS' && macro.argIndexInParent === 1) {
		return (
			context.bindingLoader?.getBusTypes().map((busType) => ({
				label: busType,
				kind: CompletionItemKind.Enum,
			})) ?? []
		);
	}

	if (macro.macro && 'DT_ON_BUS'.startsWith(macro.macro)) {
		return [
			{
				label: `DT_ON_BUS(...)`,
				insertText: `DT_ON_BUS($1, $2)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	return [];
}
