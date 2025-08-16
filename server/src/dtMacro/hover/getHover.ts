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

// async function dtNodeLabel(args: string[], context: ContextAware) {
// 	const runtime = await context?.getRuntime();
// 	const path = runtime?.resolvePath([`&${args[0].trim()}`]);
// 	if (runtime && path) {
// 		const node = Runtime.getNodeFromPath(path, runtime.rootNode, true);
// 		if (!node) {
// 			return;
// 		}

// 		const lastParser = (await runtime.context.getAllParsers()).at(-1)!;

// 		return {
// 			contents: node.toMarkupContent(
// 				lastParser.cPreprocessorParser.macros,
// 			),
// 		};
// 	}
// }

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
