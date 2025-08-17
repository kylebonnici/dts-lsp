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
import { NodeType } from 'src/dtsTypes/types';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo, toCIdentifier } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';
import { evalExp } from '../../../helpers';

export async function dtEnumIndexByIndex(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	const args = macro.args;
	if (args?.length !== 3) {
		return;
	}

	const runtime = await context?.getRuntime();

	if (runtime) {
		const node = await resolveDTMacroToNode(
			document,
			args[0],
			context,
			position,
		);

		const property = node?.property.find(
			(p) => toCIdentifier(p.name) === args[1].macro,
		);

		const idx = evalExp(args[2].macro);

		if (typeof idx !== 'number') {
			return;
		}

		const value = property?.ast.quickValues?.at(idx);

		const nodeType = node?.nodeType;
		if (
			Array.isArray(value) ||
			!property ||
			!nodeType ||
			!(nodeType instanceof NodeType)
		) {
			return;
		}

		const propType = nodeType.properties.find((p) =>
			p.getNameMatch(property.name),
		);

		if (!propType) {
			return;
		}

		const enumIdx = propType.values(property).findIndex((v) => v === value);

		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: enumIdx.toString(),
			},
		};
	}
}
