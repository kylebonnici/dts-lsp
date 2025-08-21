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

import { Hover, HoverParams } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
} from '../helpers';
import { dtMacroToNode } from '../macro/dtMacroToNode';
import { dtAliasHover } from './node/dtAlias';
import { dtChildHover } from './node/dtChild';
import { dtChildNumHover } from './node/dtChildNum';
import { dtCompatGetAnyStatusOkHover } from './node/dtCompatGetAnyStatusOk';
import { dtGParentHover } from './node/dtGParent';
import { dtHasAliasHover } from './node/dtHasAlias';
import { dtNodeFullNameHover } from './node/dtNodeFullName';
import { dtNodePathHover } from './node/dtNodePath';
import { dtNodeLabelHover } from './node/dtNodeLabel';
import { dtNodeLabelStringArrayHover } from './node/dtNodeLabelStringArray';
import { dtParentHover } from './node/dtParent';
import { dtPathHover } from './node/dtPath';
import { dtSameNodeHover } from './node/dtSameNode';
import { dtEnumIndexByIndexHover } from './property/dtEnumIndexByIndex';
import { dtPhaByIndexHover } from './property/dtPhaByIndex';
import { dtPhandelByIndexHover } from './property/dtPhandelByIndex';
import { dtPhandelByNameHover } from './property/dtPhandelByName';
import { dtPropHover } from './property/dtProp';
import { dtPropByIdxHover } from './property/dtPropByIdx';
import { dtPropOrHover } from './property/dtPropOr';
import { dtPropByPhandleIndexHover } from './property/dtPropByPhandleIndex';
import { dtRootHover } from './node/dtRoot';
import { dtChildNumStatusOkHover } from './node/dtChildNumStausOk';
import { dtPhandelHover } from './property/dtPhandel';
import { dtPhaHover } from './property/dtPha';
import { dtPhaByIndexOrHover } from './property/dtPhaByIndexOr';
import { dtPhaByNameHover } from './property/dtPhaByName';
import { dtPhaByNameOrHover } from './property/dtPhaByNameOr';
import { dtPhaOrHover } from './property/dtPhaOr';
import { dtEnumIndexByIndexOrHover } from './property/dtEnumIndexByIndexOr';
import { dtEnumIndexHover } from './property/dtEnumIndex';
import { dtEnumIndexOrHover } from './property/dtEnumIndexOr';
import { dtPropByPhandleHover } from './property/dtPropByPhandle';
import { dtPropByPhandleIndexOrHover } from './property/dtPropByPhandleIndexOr';
import { dtEnumHasValueHover } from './property/dtEnumHasValue';
import { dtEnumHasValueByIndexHover } from './property/dtEnumHasValueByIndex';
import { dtPropHasIndexHover } from './property/dtPropHasIndex';
import { dtPropHasNameHover } from './property/dtPropHasName';

async function getNodeHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	return (
		(await dtAliasHover(macro, context)) ||
		(await dtRootHover(macro, context)) ||
		(await dtChildHover(document, macro, context, hoverParams.position)) ||
		(await dtPathHover(macro, context)) ||
		(await dtChildNumHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtChildNumStatusOkHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtCompatGetAnyStatusOkHover(macro, context)) ||
		(await dtGParentHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtNodePathHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtHasAliasHover(macro, context)) ||
		(await dtNodeFullNameHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtNodeLabelHover(macro, context)) ||
		(await dtNodeLabelStringArrayHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtParentHover(document, macro, context, hoverParams.position)) ||
		(await dtSameNodeHover(document, macro, context, hoverParams.position))
	);
}

async function getPropertyHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	return (
		(await dtEnumHasValueHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtEnumHasValueByIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtEnumIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtEnumIndexOrHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtEnumIndexByIndexOrHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtEnumIndexByIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhaHover(document, macro, context, hoverParams.position)) ||
		(await dtPhaOrHover(document, macro, context, hoverParams.position)) ||
		(await dtPhaByIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhaByIndexOrHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhaByNameHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhaByNameOrHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhandelHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhandelByIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPhandelByNameHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropHover(document, macro, context, hoverParams.position)) ||
		(await dtPropByIdxHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropByPhandleHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropByPhandleIndexOrHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropByPhandleIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropHasIndexHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropHasNameHover(
			document,
			macro,
			context,
			hoverParams.position,
		)) ||
		(await dtPropOrHover(document, macro, context, hoverParams.position))
	);
}

export async function getHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<Hover | undefined> {
	if (!document) return;
	const macro = getMacroAtPosition(document, hoverParams.position);

	if (!macro?.macro) {
		return;
	}

	const hover =
		(await getNodeHover(hoverParams, context, document, macro)) ||
		(await getPropertyHover(hoverParams, context, document, macro));

	if (hover) {
		return hover;
	}

	const node = await dtMacroToNode(
		document,
		macro,
		context,
		hoverParams.position,
	);

	if (node) {
		return {
			contents: node.toMarkupContent(context.macros),
		};
	}

	// we need to recursivly find definition
	const newPosition = findMacroDefinition(
		document,
		macro.macro,
		hoverParams.position,
	);
	if (!newPosition) {
		return;
	}

	return getHover(
		{ ...hoverParams, position: newPosition },
		context,
		document,
	);
}
