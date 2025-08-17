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
import { getTokenizedDocumentProvider } from '../../providers/tokenizedDocument';
import { fileURLToPath } from '../../helpers';
import {
	DTMacroInfo,
	findMacroDefinition,
	getMacroAtPosition,
} from '../helpers';
import { dtAlias } from './node/dtAlias';
import { dtChild } from './node/dtChild';
import { dtChildNum } from './node/dtChildNum';
import { dtCompatGetAnyStatusOk } from './node/dtCompatGetAnyStatusOk';
import { dtGParent } from './node/dtGParent';
import { dtHasAlias } from './node/dtHasAlias';
import { dtNodeFullName } from './node/dtNodeFullName';
import { dtNodePath } from './node/dtNodePath';
import { dtNodeLabel } from './node/dtNodeLabel';
import { dtNodeLabelStringArray } from './node/dtNodeLabelStringArray';
import { dtParent } from './node/dtParent';
import { dtPath } from './node/dtPath';
import { dtSameNode } from './node/dtSameNode';
import { dtEnumIndexByIndex } from './property/dtEnumIndexByIndex';
import { dtPhaByIndex } from './property/dtPhaByIndex';
import { dtPhandelByIndex } from './property/dtPhandelByIndex';

async function getNodeHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	if (macro.parent?.macro === 'DT_ALIAS') {
		return await dtAlias(macro.macro.trim(), context);
	}

	if (macro.macro === 'DT_ALIAS' && macro.args?.[0]) {
		return await dtAlias(macro.args[0].macro.trim(), context);
	}

	if (macro.macro === 'DT_CHILD') {
		return await dtChild(document, macro, context, hoverParams.position);
	}

	if (macro.parent?.macro === 'DT_CHILD' && macro.argIndexInParent === 1) {
		return await dtChild(
			document,
			macro.parent,
			context,
			hoverParams.position,
		);
	}

	if (macro?.macro === 'DT_CHILD_NUM') {
		return await dtChildNum(document, macro, context, hoverParams.position);
	}

	if (macro.macro === 'DT_CHILD_NUM_STATUS_OKAY') {
		return await dtChildNum(
			document,
			macro,
			context,
			hoverParams.position,
			true,
		);
	}

	if (macro.macro === 'DT_COMPAT_GET_ANY_STATUS_OKAY') {
		return macro.args?.[0].macro
			? dtCompatGetAnyStatusOk(macro.args[0].macro, context)
			: undefined;
	}

	if (macro.parent?.macro === 'DT_COMPAT_GET_ANY_STATUS_OKAY') {
		return dtCompatGetAnyStatusOk(macro.macro, context);
	}

	if (macro.macro === 'DT_GPARENT') {
		return dtGParent(document, macro, context, hoverParams.position);
	}

	if (macro.parent?.macro === 'DT_HAS_ALIAS') {
		return await dtAlias(macro.macro.trim(), context);
	}

	if (macro.macro === 'DT_HAS_ALIAS' && macro.args?.[0]) {
		return await dtHasAlias(macro.args[0].macro.trim(), context);
	}

	// TODO  DT_INST,  DT_NODE_CHILD_IDX

	if (macro.macro === 'DT_NODE_FULL_NAME') {
		return await dtNodeFullName(
			document,
			macro,
			context,
			hoverParams.position,
			'Quoted',
		);
	}

	if (macro.macro === 'DT_NODE_FULL_NAME_TOKEN') {
		return await dtNodeFullName(
			document,
			macro,
			context,
			hoverParams.position,
			'Token',
		);
	}

	if (macro.macro === 'DT_NODE_FULL_NAME_UNQUOTED') {
		return await dtNodeFullName(
			document,
			macro,
			context,
			hoverParams.position,
			'Unquoted',
		);
	}

	if (macro.macro === 'DT_NODE_FULL_NAME_UPPER_TOKEN') {
		return await dtNodeFullName(
			document,
			macro,
			context,
			hoverParams.position,
			'Upper Token',
		);
	}

	// TODO DT_NODE_HASH

	if (macro.macro === 'DT_NODE_PATH') {
		return await dtNodePath(document, macro, context, hoverParams.position);
	}

	if (macro.parent?.macro === 'DT_NODELABEL') {
		return await dtNodeLabel(macro.macro.trim(), context);
	}

	if (macro.macro === 'DT_NODELABEL' && macro.args?.[0]) {
		return await dtNodeLabel(macro.args[0].macro.trim(), context);
	}

	if (macro.macro === 'DT_NODELABEL_STRING_ARRAY') {
		return await dtNodeLabelStringArray(
			document,
			macro,
			context,
			hoverParams.position,
		);
	}

	if (macro.macro === 'DT_PARENT') {
		return dtParent(document, macro, context, hoverParams.position);
	}

	if (macro.macro === 'DT_PATH') {
		return macro.args
			? dtPath(
					macro.args.map((a) => a.macro),
					context,
				)
			: undefined;
	}

	if (macro.macro === 'DT_ROOT') {
		const runtime = await context.getRuntime();
		const lastParser = (await runtime.context.getAllParsers()).at(-1)!;

		return {
			contents: runtime.rootNode.toMarkupContent(
				lastParser.cPreprocessorParser.macros,
			),
		};
	}

	if (macro.macro === 'DT_SAME_NODE') {
		return dtSameNode(document, macro, context, hoverParams.position);
	}
}

async function getPropertyHover(
	hoverParams: HoverParams,
	context: ContextAware,
	document: TextDocument,
	macro: DTMacroInfo,
): Promise<Hover | undefined> {
	if (macro.macro === 'DT_ENUM_IDX') {
		return macro.args?.length === 2
			? await dtEnumIndexByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					0,
				)
			: undefined;
	}

	if (macro.macro === 'DT_ENUM_IDX_BY_IDX') {
		return macro.args?.length === 3
			? await dtEnumIndexByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_ENUM_IDX_BY_IDX_OR') {
		return macro.args?.length === 4
			? await dtEnumIndexByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
					macro.args[3].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_ENUM_IDX_OR') {
		return macro.args?.length === 4
			? await dtEnumIndexByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					0,
					macro.args[2].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA') {
		return macro.args?.length === 3
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					0,
					macro.args[2].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA_BY_IDX') {
		return macro.args?.length === 4
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
					macro.args[3].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA_BY_IDX_OR') {
		return macro.args?.length === 5
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
					macro.args[3].macro,
					macro.args[4].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA_OR') {
		return macro.args?.length === 4
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					0,
					macro.args[2].macro,
					macro.args[3].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA_BY_NAME') {
		return macro.args?.length === 4
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
					macro.args[3].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHA_BY_NAME_OR') {
		return macro.args?.length === 5
			? await dtPhaByIndex(
					document,
					macro.args[0],
					macro.args[1].macro,
					context,
					hoverParams.position,
					macro.args[2].macro,
					macro.args[3].macro,
					macro.args[4].macro,
				)
			: undefined;
	}

	if (macro.macro === 'DT_PHANDLE_BY_IDX' || macro.macro === 'DT_PHANDLE') {
		return await dtPhandelByIndex(
			document,
			macro,
			context,
			hoverParams.position,
		);
	}
}

export async function getHover(
	hoverParams: HoverParams,
	context: ContextAware,
): Promise<Hover | undefined> {
	const filePath = fileURLToPath(hoverParams.textDocument.uri);
	const document = getTokenizedDocumentProvider().getDocument(filePath);
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

	// we need to recursivly find definition
	const newPosition = findMacroDefinition(
		document,
		macro.macro,
		hoverParams.position,
	);
	if (!newPosition) {
		return;
	}

	return getHover({ ...hoverParams, position: newPosition }, context);
}
