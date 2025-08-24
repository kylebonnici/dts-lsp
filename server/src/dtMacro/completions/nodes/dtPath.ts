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
import { dtPathRaw } from 'src/dtMacro/macro/raw/node/dtPath';
import { ResolveMacroRequest, toCIdentifier } from '../../helpers';

export async function dtPathComplitions({
	macro,
	context,
}: ResolveMacroRequest): Promise<CompletionItem[]> {
	if (macro.macro && macro.macro && 'DT_PATH'.startsWith(macro.macro)) {
		return [
			{
				label: `DT_PATH(...)`,
				insertText: `DT_PATH($1)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	if (macro.parent?.macro !== 'DT_PATH' || !macro.parent.args?.length) {
		return [];
	}

	const node = await dtPathRaw(
		macro.parent.args.slice(0, -1).map((m) => m.macro),
		context,
	);

	return (
		node?.nodes.map(
			(n) =>
				({
					label: toCIdentifier(n.fullName),
					kind: CompletionItemKind.Class,
					documentation: n.toMarkupContent(context.macros),
				}) satisfies CompletionItem,
		) ?? []
	);
}
