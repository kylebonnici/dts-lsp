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

import { Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
} from './helpers';
import { resolveDtAlias } from './dtAlias';
import { resolveDtChild } from './dtChild';
import { resolveDtGParent } from './dtGParent';
import { resolveDtCompatGetAnyStatusOk } from './dtCompatGetAnyStatusOk';
import { resolveDtNodeLabel } from './dtNodeLabel';
import { resolveDtParent } from './dtParent';
import { resolveDtPath } from './dtPath';
import { resolveDtPhandelByIndex } from './dtPhandelByIndex';
import { resolverDtPhandelByName } from './dtPhandelByName';

export async function resolveDTMacroToNode(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
): Promise<Node | undefined> {
	if (
		['DT_ALIAS', 'DT_NODELABEL'].some((m) => m === macro.parent?.macro) ||
		(macro.parent?.macro === 'DT_CHILD' && macro.argIndexInParent === 1)
	) {
		macro = macro.parent!;
	}

	if (macro.parent?.macro === 'DT_HAS_ALIAS') {
		return resolveDtAlias(macro.macro, context);
	}

	if (macro.parent?.macro === 'DT_PATH') {
		return resolveDtPath(
			macro.parent.args
				?.slice(0, (macro.argIndexInParent ?? 0) + 1)
				.map((p) => p.macro) ?? [],
			context,
		);
	}

	switch (macro.macro) {
		case 'DT_ALIAS':
			return macro.args?.[0]
				? resolveDtAlias(macro.args[0].macro, context)
				: undefined;
		case 'DT_NODELABEL':
			return macro.args?.[0]
				? resolveDtNodeLabel(macro.args[0].macro, context)
				: undefined;
		case 'DT_CHILD':
			return resolveDtChild(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
		case 'DT_GPARENT':
			return resolveDtGParent(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
		case 'DT_COMPAT_GET_ANY_STATUS_OKAY':
			return macro.args?.length === 1
				? (
						await resolveDtCompatGetAnyStatusOk(
							macro.args[0].macro,
							context,
						)
					)?.at(0)
				: undefined;
		case 'DT_PARENT':
			return resolveDtParent(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
		case 'DT_PATH':
			return macro.args
				? resolveDtPath(
						macro.args.map((a) => a.macro),
						context,
					)
				: undefined;
		case 'DT_ROOT':
			return (await context.getRuntime()).rootNode;
		case 'DT_PHANDLE_BY_IDX':
			return resolveDtPhandelByIndex(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
		case 'DT_PHANDLE':
			return resolveDtPhandelByIndex(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
		case 'DT_PHANDLE_BY_NAME':
			return resolverDtPhandelByName(
				document,
				macro,
				context,
				position,
				resolveDTMacroToNode,
			);
	}

	const newPosition = findMacroDefinition(document, macro.macro, position);
	if (!newPosition) {
		return;
	}

	const newMacro = getMacroAtPosition(document, newPosition);
	if (!newMacro) {
		return;
	}

	return resolveDTMacroToNode(document, newMacro, context, newPosition);
}
