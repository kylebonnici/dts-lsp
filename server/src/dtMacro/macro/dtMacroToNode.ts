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
import { ContextAware } from '../../runtimeEvaluator';
import { Node } from '../../context/node';
import { dtPropOrNode } from '../dtPropOr';
import { dtPropByIndexNode } from '../dtPropByIndex';
import { dtPropNode } from '../dtProp';
import {
	DTMacroInfo,
	findMacroDefinitionPosition,
	getMacroAtPosition,
} from '../helpers';
import { dtPhandelByName } from './properties/dtPhandelByName';
import { dtPhandelByIndex } from './properties/dtPhandelByIndex';
import { dtPhandel } from './properties/dtPhandel';
import { dtRoot } from './node/dtRoot';
import { dtPath } from './node/dtPath';
import { dtParent } from './node/dtParent';
import { dtGParent } from './node/dtGParent';
import { dtChild } from './node/dtChild';
import { dtNodeLabel } from './node/dtNodeLabel';
import { dtAlias } from './node/dtAlias';
import { dtCompatGetAnyStatusOk } from './node/dtCompatGetAnyStatusOk';

export async function dtMacroToNode(
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
	} else if (macro.parent?.macro === 'DT_HAS_ALIAS') {
		macro = macro.parent;
		macro.macro = 'DT_ALIAS';
	} else if (macro.parent?.macro === 'DT_PATH') {
		macro.parent.args =
			macro.parent.args?.slice(0, (macro.argIndexInParent ?? 0) + 1) ??
			[];
		macro = macro.parent;
	}

	// TODO Add all or operators

	let v =
		(await dtCompatGetAnyStatusOk(macro, context)) ||
		(await dtAlias(macro, context)) ||
		(await dtNodeLabel(macro, context)) ||
		(await dtChild(document, macro, context, position, dtMacroToNode)) ||
		(await dtGParent(document, macro, context, position, dtMacroToNode)) ||
		(await dtParent(document, macro, context, position, dtMacroToNode)) ||
		(await dtPath(macro, context)) ||
		(await dtRoot(macro, context)) ||
		(await dtPhandel(document, macro, context, position, dtMacroToNode)) ||
		(await dtPhandelByIndex(
			document,
			macro,
			context,
			position,
			dtMacroToNode,
		)) ||
		(await dtPhandelByName(
			document,
			macro,
			context,
			position,
			dtMacroToNode,
		)) ||
		(await dtPropNode(document, macro, context, position, dtMacroToNode)) ||
		(await dtPropByIndexNode(
			document,
			macro,
			context,
			position,
			dtMacroToNode,
		)) ||
		(await dtPropOrNode(document, macro, context, position, dtMacroToNode));

	if (v) {
		return Array.isArray(v) ? v.at(0) : v;
	}

	const newPosition = findMacroDefinitionPosition(
		document,
		macro.macro,
		position,
	);
	if (!newPosition) {
		return;
	}

	const newMacro = getMacroAtPosition(document, newPosition);
	if (!newMacro) {
		return;
	}

	return dtMacroToNode(document, newMacro, context, newPosition);
}
