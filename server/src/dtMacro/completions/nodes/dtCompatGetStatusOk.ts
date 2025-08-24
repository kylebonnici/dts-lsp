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
import { ResolveMacroRequest, toCIdentifier } from '../../helpers';

export function dtCompatGetStatusOkComplitions({
	macro,
	context,
}: ResolveMacroRequest): CompletionItem[] {
	if (
		macro.macro &&
		'DT_COMPAT_GET_ANY_STATUS_OKAY'.startsWith(macro.macro)
	) {
		return [
			{
				label: `DT_COMPAT_GET_ANY_STATUS_OKAY(...)`,
				insertText: `DT_COMPAT_GET_ANY_STATUS_OKAY($1)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	if (
		macro.parent?.macro !== 'DT_COMPAT_GET_ANY_STATUS_OKAY' ||
		macro.argIndexInParent !== 0
	) {
		return [];
	}

	return (
		context.bindingLoader?.getBindings().map(
			(binding) =>
				({
					label: toCIdentifier(binding),
					kind: CompletionItemKind.Property,
				}) satisfies CompletionItem,
		) ?? []
	);
}
