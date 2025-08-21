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
import { Position, TextDocument } from 'vscode-languageserver-textdocument';
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
	position: Position,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	return (
		(await dtAliasHover(macro, context)) ||
		(await dtRootHover(macro, context)) ||
		(await dtChildHover(document, macro, context, position)) ||
		(await dtPathHover(macro, context)) ||
		(await dtChildNumHover(document, macro, context, position)) ||
		(await dtChildNumStatusOkHover(document, macro, context, position)) ||
		(await dtCompatGetAnyStatusOkHover(macro, context)) ||
		(await dtGParentHover(document, macro, context, position)) ||
		(await dtNodePathHover(document, macro, context, position)) ||
		(await dtHasAliasHover(macro, context)) ||
		(await dtNodeFullNameHover(document, macro, context, position)) ||
		(await dtNodeLabelHover(macro, context)) ||
		(await dtNodeLabelStringArrayHover(
			document,
			macro,
			context,
			position,
		)) ||
		(await dtParentHover(document, macro, context, position)) ||
		(await dtSameNodeHover(document, macro, context, position))
	);
}

async function getPropertyHover(
	position: Position,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	return (
		(await dtEnumHasValueHover(document, macro, context, position)) ||
		(await dtEnumHasValueByIndexHover(
			document,
			macro,
			context,
			position,
		)) ||
		(await dtEnumIndexHover(document, macro, context, position)) ||
		(await dtEnumIndexOrHover(document, macro, context, position)) ||
		(await dtEnumIndexByIndexOrHover(document, macro, context, position)) ||
		(await dtEnumIndexByIndexHover(document, macro, context, position)) ||
		(await dtPhaHover(document, macro, context, position)) ||
		(await dtPhaOrHover(document, macro, context, position)) ||
		(await dtPhaByIndexHover(document, macro, context, position)) ||
		(await dtPhaByIndexOrHover(document, macro, context, position)) ||
		(await dtPhaByNameHover(document, macro, context, position)) ||
		(await dtPhaByNameOrHover(document, macro, context, position)) ||
		(await dtPhandelHover(document, macro, context, position)) ||
		(await dtPhandelByIndexHover(document, macro, context, position)) ||
		(await dtPhandelByNameHover(document, macro, context, position)) ||
		(await dtPropHover(document, macro, context, position)) ||
		(await dtPropByIdxHover(document, macro, context, position)) ||
		(await dtPropByPhandleHover(document, macro, context, position)) ||
		(await dtPropByPhandleIndexOrHover(
			document,
			macro,
			context,
			position,
		)) ||
		(await dtPropByPhandleIndexHover(document, macro, context, position)) ||
		(await dtPropHasIndexHover(document, macro, context, position)) ||
		(await dtPropHasNameHover(document, macro, context, position)) ||
		(await dtPropOrHover(document, macro, context, position))
	);
}

export async function getHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<Hover | undefined> {
	if (!document) return;
	const macro = getMacroAtPosition(document, hoverParams.position);
	return getHoverFrom(macro, hoverParams.position, context, document);
}

async function getHoverFrom(
	macro: DTMacroInfo | undefined,
	position: Position,
	context: ContextAware,
	document: TextDocument,
): Promise<Hover | undefined> {
	if (!macro?.macro) {
		return;
	}

	const hover =
		(await getNodeHover(position, context, document, macro)) ||
		(await getPropertyHover(position, context, document, macro));

	if (hover) {
		return hover;
	}

	const node = await dtMacroToNode(document, macro, context, position);

	if (node) {
		return {
			contents: node.toMarkupContent(context.macros),
		};
	}

	const newMacro = findMacroDefinition(
		document,
		macro.macro,
		position,
		context,
	);

	if (!newMacro) {
		return;
	}

	return getHoverFrom(newMacro[0], newMacro[1], context, document);
}
