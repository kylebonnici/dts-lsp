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
import { ContextAware } from '../../runtimeEvaluator';
import { getTokenizedDocumentProvider } from '../../providers/tokenizedDocument';
import { fileURLToPath } from '../../helpers';
import { findMacroDefinition, getMacroAtPosition } from '../helpers';
import { dtAlias } from './dtAlias';
import { dtChild } from './dtChild';
import { dtChildNum } from './dtChildNum';
import { dtCompatGetAnyStatusOk } from './dtCompatGetAnyStatusOk';
import { dtGParent } from './dtGParent';
import { dtHasAlias } from './dtHasAlias';
import { dtNodeFullName } from './dtNodeFullName';
import { dtNodePath } from './dtNodePath';
import { dtNodeLabel } from './dtNodeLabel';
import { dtNodeLabelStringArray } from './dtNodeLabelStringArray';
import { dtParent } from './dtParent';
import { dtPath } from './dtPath';

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

	if (macro.parent?.macro === 'DT_ALIAS') {
		return await dtAlias(macro.macro.trim(), context);
	}

	if (macro.macro === 'DT_ALIAS' && macro.args?.[0]) {
		return await dtAlias(macro.args[0].macro.trim(), context);
	}

	if (macro?.macro === 'DT_CHILD') {
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

	if (macro?.macro === 'DT_CHILD_NUM_STATUS_OKAY') {
		return await dtChildNum(
			document,
			macro,
			context,
			hoverParams.position,
			true,
		);
	}

	if (macro?.macro === 'DT_COMPAT_GET_ANY_STATUS_OKAY') {
		return macro.args?.[0].macro
			? dtCompatGetAnyStatusOk(macro.args[0].macro, context)
			: undefined;
	}

	if (macro?.parent?.macro === 'DT_COMPAT_GET_ANY_STATUS_OKAY') {
		return dtCompatGetAnyStatusOk(macro.macro, context);
	}

	if (macro?.macro === 'DT_GPARENT') {
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

	if (macro?.macro === 'DT_PARENT') {
		return dtParent(document, macro, context, hoverParams.position);
	}

	if (macro?.macro === 'DT_PATH') {
		return macro.args
			? dtPath(
					macro.args.map((a) => a.macro),
					context,
				)
			: undefined;
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
