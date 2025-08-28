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

import { Hover, HoverParams, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
	ResolveMacroRequest,
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
import { dtInstHover } from './node/dtInst';
import { dtPropLenHover } from './property/dtPropLen';
import { dtPropLenOrHover } from './property/dtPropLenOr';
import { dtPropLastHover } from './property/dtPropLast';
import { dtStringTokenHover } from './property/dtStringToken';
import { dtStringTokenByIndexHover } from './property/dtStringTokenByIndex';
import { dtStringTokenOrHover } from './property/dtStringTokenOr';
import { dtStringUnquotedByIndexHover } from './property/dtStringUnquotedByIndex';
import { dtStringUnquotedHover } from './property/dtStringUnquoted';
import { dtStringUnquotedOrHover } from './property/dtStringUnquotedOr';
import { dtStringUpperTokenByIndexHover } from './property/dtStringUpperTokenByIndex';
import { dtStringUpperTokenHover } from './property/dtStringUpperToken';
import { dtStringUpperTokenOrHover } from './property/dtStringUpperTokenOr';
import { dtBusHover } from './bus/dtBus';
import { dtOnBusHover } from './bus/dtOnBus';
import { dtChosenHover } from './chosen/dtChosen';
import { dtHasChosenHover } from './chosen/dtHasChosen';

async function getNodeHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	return [
		dtBusHover,
		dtOnBusHover,
		//
		dtChosenHover,
		dtHasChosenHover,
		//
		dtAliasHover,
		dtChildHover,
		dtChildNumHover,
		dtChildNumStatusOkHover,
		dtCompatGetAnyStatusOkHover,
		dtGParentHover,
		dtHasAliasHover,
		dtInstHover,
		dtRootHover,
		dtPathHover,
		dtNodePathHover,
		dtNodeFullNameHover,
		dtNodeLabelHover,
		dtNodeLabelStringArrayHover,
		dtParentHover,
		dtSameNodeHover,
	].reduce(
		(accPromise, fn) =>
			accPromise.then((v) => v || fn(resolveMacroRequest)),
		Promise.resolve<Hover | undefined>(undefined),
	);
}

async function getPropertyHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	return [
		dtEnumHasValueByIndexHover,
		dtEnumHasValueHover,
		dtEnumIndexByIndexHover,
		dtEnumIndexByIndexOrHover,
		dtEnumIndexHover,
		dtEnumIndexOrHover,
		dtPhaByIndexHover,
		dtPhaByIndexOrHover,
		dtPhaByNameHover,
		dtPhaByNameOrHover,
		dtPhaHover,
		dtPhandelByIndexHover,
		dtPhandelByNameHover,
		dtPhandelHover,
		dtPhaOrHover,
		dtPropByIdxHover,
		dtPropByPhandleHover,
		dtPropByPhandleIndexHover,
		dtPropByPhandleIndexOrHover,
		dtPropHasIndexHover,
		dtPropHasNameHover,
		dtPropHover,
		dtPropLastHover,
		dtPropLenHover,
		dtPropLenOrHover,
		dtPropOrHover,
		dtStringTokenByIndexHover,
		dtStringTokenHover,
		dtStringTokenOrHover,
		dtStringUnquotedByIndexHover,
		dtStringUnquotedHover,
		dtStringUnquotedOrHover,
		dtStringUpperTokenByIndexHover,
		dtStringUpperTokenHover,
		dtStringUpperTokenOrHover,
	].reduce(
		(accPromise, fn) =>
			accPromise.then((v) => v || fn(resolveMacroRequest)),
		Promise.resolve<Hover | undefined>(undefined),
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
		(await getNodeHover({ position, context, document, macro })) ||
		(await getPropertyHover({ position, context, document, macro }));

	if (hover) {
		return hover;
	}

	const node = await dtMacroToNode({ document, macro, context, position });

	if (node) {
		return {
			contents: node.toMarkupContent(context.macros),
		};
	}

	const newMacro = await findMacroDefinition(
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
