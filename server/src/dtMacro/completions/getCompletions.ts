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
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import { DTMacroInfo, getMacroAtPosition } from '../helpers';
import { dtAliasComplitions } from './nodes/dtAlias';
import { dtChildComplitions } from './nodes/dtChild';
import { dtCompatGetStatusOkComplitions } from './nodes/dtCompatGetStatusOk';
import { dtInstComplitions } from './nodes/dtInst';
import { dtNodeLabelComplitions } from './nodes/dtNodeLabel';
import { dtPathComplitions } from './nodes/dtPath';
import { dtRootComplitions } from './nodes/dtRoot';
import { dtSameNodeComplitions } from './nodes/dtSameNode';
import { dtEnumHasValueComplitions } from './property/dtEnumHasValue';
import { dtEnumHasValueByIndexComplitions } from './property/dtEnumHasValueByIndex';
import { dtEnumIndexComplitions } from './property/dtEnumIndex';
import { dtEnumIndexByIndexComplitions } from './property/dtEnumIndexByIndex';
import { dtEnumIndexByIndexOrComplitions } from './property/dtEnumIndexByIndexOr';
import { dtEnumIndexOrComplitions } from './property/dtEnumIndexOr';
import { dtPhaComplitions } from './property/dtPha';
import { dtPhaByIndexComplitions } from './property/dtPhaByIndex';
import { dtPhaByNameComplitions } from './property/dtPhaByName';
import { dtPhaByNameOrComplitions } from './property/dtPhaByNameOr';
import { dtPhaOrComplitions } from './property/dtPhaOr';
import { dtPhandleComplitions } from './property/dtPhandle';
import { dtPhandleByIndexComplitions } from './property/dtPhandleByIndex';
import { dtPhandleByNameComplitions } from './property/dtPhandleByName';
import { dtPropComplitions } from './property/dtProp';
import { dtPropByIndexComplitions } from './property/dtPropByIndex';
import { dtPropByPhaIndexComplitions } from './property/dtPropByPhaIndex';
import { dtPropByPhaComplitions } from './property/dtPropByPha';
import { dtPropByPhaIndexOrComplitions } from './property/dtPropByPhaIndexOr';
import { dtPropHasIndexComplitions } from './property/dtPropHasIndex';
import { dtPropHasNameComplitions } from './property/dtPropHasName';

const MACRO_ONLY = [
	'DT_CHILD_NUM',
	'DT_CHILD_NUM_STATUS_OKAY',
	'DT_GPARENT',
	'DT_HAS_ALIAS',
	'DT_NODE_CHILD_IDX',
	'DT_NODE_FULL_NAME',
	'DT_NODE_FULL_NAME_TOKEN',
	'DT_NODE_FULL_NAME_UNQUOTED',
	'DT_NODE_FULL_NAME_UPPER_TOKEN',
	'DT_NODE_HASH',
	'DT_NODE_PATH',
	'DT_NODELABEL_STRING_ARRAY',
	'DT_PARENT',
];

export async function getCompletions(
	location: TextDocumentPositionParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<CompletionItem[]> {
	if (!document) return [];

	const macro = getMacroAtPosition(document, location.position);
	const runtime = await context.getRuntime();

	if (!macro) {
		return [];
	}

	return [
		...dtAliasComplitions(macro, runtime),
		...(await dtChildComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...dtMacroOnlyComplitions(macro),
		...dtInstComplitions(macro, runtime),
		...dtCompatGetStatusOkComplitions(macro, runtime),
		...(await dtNodeLabelComplitions(macro, runtime)),
		...(await dtPathComplitions(context, macro)),
		...dtRootComplitions(runtime, macro),
		...dtSameNodeComplitions(macro),
		//
		...(await dtEnumHasValueComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtEnumHasValueByIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtEnumIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtEnumIndexByIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtEnumIndexByIndexOrComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtEnumIndexOrComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhaComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhaByIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhaByNameComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhaByNameOrComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhaOrComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhandleComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhandleByIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPhandleByNameComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropByIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropByPhaComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropByPhaIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropByPhaIndexOrComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropHasIndexComplitions(
			document,
			context,
			macro,
			location.position,
		)),
		...(await dtPropHasNameComplitions(
			document,
			context,
			macro,
			location.position,
		)),
	];
}

function dtMacroOnlyComplitions(macro: DTMacroInfo): CompletionItem[] {
	if (!macro.macro) {
		return [];
	}
	return MACRO_ONLY.filter((m) => m.startsWith(macro.macro)).map(
		(m) =>
			({
				label: `${m}(...)`,
				insertText: `${m}($1)`,
				kind: CompletionItemKind.Function,
				insertTextFormat: InsertTextFormat.Snippet,
			}) satisfies CompletionItem,
	);
}
