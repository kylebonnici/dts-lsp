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
import { NodePath } from 'src/ast/dtc/values/nodePath';
import { ResolveMacroRequest, toCIdentifier } from '../../../dtMacro/helpers';
import { Node } from '../../../context/node';
import { LabelRef } from '../../../ast/dtc/labelRef';

export async function dtAliasComplitions({
	macro,
	context,
}: ResolveMacroRequest): Promise<CompletionItem[]> {
	if (macro.macro && 'DT_ALIAS'.startsWith(macro.macro)) {
		return [
			{
				label: `DT_ALIAS(...)`,
				insertText: `DT_ALIAS($1)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	if (macro.parent?.macro !== 'DT_ALIAS' || macro.argIndexInParent !== 0) {
		return [];
	}

	const runtime = await context.getRuntime();

	return (
		runtime.rootNode.getNode('aliases')?.property.map((prop) => {
			const v = prop.ast.getFlatAstValues()?.at(0);
			let node: Node | undefined;
			if (v instanceof LabelRef) {
				node = v.linksTo;
			} else if (v instanceof NodePath) {
				node = v.pathParts.at(-1)?.linksTo;
			}

			return {
				label: toCIdentifier(prop.name),
				kind: CompletionItemKind.Property,
				documentation: node?.toMarkupContent(runtime.context.macros),
			} satisfies CompletionItem;
		}) ?? []
	);
}
