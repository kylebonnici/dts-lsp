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
import { DTMacroInfo, toCIdentifier } from '../../../dtMacro/helpers';
import { Runtime } from '../../../context/runtime';

export function dtAliasComplitions(
	macro: DTMacroInfo,
	runtime: Runtime,
): CompletionItem[] {
	const aliasesNode = runtime.rootNode.getNode('aliases');

	if (macro.macro && 'DT_ALIAS'.startsWith(macro.macro)) {
		return (
			aliasesNode?.property.map((prop) => ({
				label: `DT_ALIAS(${toCIdentifier(prop.name)})`,
				kind: CompletionItemKind.Function,
			})) ?? [
				{
					label: `DT_ALIAS`,
					insertText: `DT_ALIAS($1)`,
					kind: CompletionItemKind.Function,
					insertTextFormat: InsertTextFormat.Snippet,
				},
			]
		);
	}

	if (macro.parent?.macro !== 'DT_ALIAS' || macro.argIndexInParent !== 0) {
		return [];
	}

	return (
		runtime.rootNode.getNode('aliases')?.property.map(
			(prop) =>
				({
					label: toCIdentifier(prop.name),
					kind: CompletionItemKind.Property,
				}) satisfies CompletionItem,
		) ?? []
	);
}
