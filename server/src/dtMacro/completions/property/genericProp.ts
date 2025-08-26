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
import { dtMacroToNode } from '../../macro/dtMacroToNode';
import { DTMacroInfo, ResolveMacroRequest, toCIdentifier } from '../../helpers';
import { Property } from '../../../context/property';
import { Node } from '../../../context/node';

export async function genericPropertyCompletion(
	{ macro, document, position, context }: ResolveMacroRequest,
	macroName: string,
	propertyIndex: number,
	numberOfArguments: number,
	filter?: (property: Property) => boolean,
	fetchNode: (macro: DTMacroInfo) => Promise<Node | undefined> = (m) =>
		dtMacroToNode({ document, macro: m, context, position }),
): Promise<CompletionItem[]> {
	if (macro.macro && macro.macro && macroName.startsWith(macro.macro)) {
		return [
			{
				label: `${macroName}(...)`,
				insertText: `${macroName}(${Array(numberOfArguments)
					.map((_, i) => `${i + 1}`)
					.join(', ')})`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			},
		];
	}

	if (
		macro.parent?.macro !== macroName ||
		macro.argIndexInParent !== propertyIndex ||
		!macro.parent.args?.length
	) {
		return [];
	}

	const node = await fetchNode(macro.parent.args[0]);

	const properties = filter ? node?.property.filter(filter) : node?.property;

	return (
		properties?.map(
			(prop) =>
				({
					label: toCIdentifier(prop.name),
					kind: CompletionItemKind.Property,
					documentation: prop.toPrettyString(context.macros),
				}) satisfies CompletionItem,
		) ?? []
	);
}
