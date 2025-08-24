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
import { getMacroAtPosition, ResolveMacroRequest } from '../helpers';
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
import { dtPropLastComplitions } from './property/dtPropLast';
import { dtPropLenComplitions } from './property/dtPropLen';
import { dtPropLenOrComplitions } from './property/dtPropLenOr';
import { dtPropOrComplitions } from './property/dtPropOr';
import { dtStringTokenComplitions } from './property/dtStringToken';
import { dtStringTokenByIndexComplitions } from './property/dtStringTokenByIndex';
import { dtStringTokenOrComplitions } from './property/dtStringTokenOr';
import { dtStringUnquotedComplitions } from './property/dtStringUnquoted';
import { dtStringUnquotedByIndexComplitions } from './property/dtStringUnquotedByIndex';
import { dtStringUnquotedOrComplitions } from './property/dtStringUnquotedOr';
import { dtStringUpperTokenComplitions } from './property/dtStringUpperToken';
import { dtStringUpperTokenByIndexComplitions } from './property/dtStringUpperTokenByIndex';
import { dtStringUpperTokenOrComplitions } from './property/dtStringUpperTokenOr';

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

	if (!macro) {
		return [];
	}

	return (
		await Promise.all(
			[
				dtAliasComplitions,
				dtChildComplitions,
				dtCompatGetStatusOkComplitions,
				dtInstComplitions,
				dtMacroOnlyComplitions,
				dtNodeLabelComplitions,
				dtPathComplitions,
				dtRootComplitions,
				dtSameNodeComplitions,
				//
				dtEnumHasValueByIndexComplitions,
				dtEnumHasValueComplitions,
				dtEnumIndexByIndexComplitions,
				dtEnumIndexByIndexOrComplitions,
				dtEnumIndexComplitions,
				dtEnumIndexOrComplitions,
				dtPhaByIndexComplitions,
				dtPhaByNameComplitions,
				dtPhaByNameOrComplitions,
				dtPhaComplitions,
				dtPhandleByIndexComplitions,
				dtPhandleByNameComplitions,
				dtPhandleComplitions,
				dtPhaOrComplitions,
				dtPropByIndexComplitions,
				dtPropByPhaComplitions,
				dtPropByPhaIndexComplitions,
				dtPropByPhaIndexOrComplitions,
				dtPropComplitions,
				dtPropHasIndexComplitions,
				dtPropHasNameComplitions,
				dtPropLastComplitions,
				dtPropLenComplitions,
				dtPropLenOrComplitions,
				dtPropOrComplitions,
				dtStringTokenComplitions,
				dtStringTokenByIndexComplitions,
				dtStringTokenOrComplitions,
				dtStringUnquotedComplitions,
				dtStringUnquotedByIndexComplitions,
				dtStringUnquotedOrComplitions,
				dtStringUpperTokenComplitions,
				dtStringUpperTokenByIndexComplitions,
				dtStringUpperTokenOrComplitions,
			].flatMap(
				async (fn) =>
					await fn({
						document,
						context,
						macro,
						position: location.position,
					}),
			),
		)
	).flat();
}

function dtMacroOnlyComplitions({
	macro,
}: ResolveMacroRequest): CompletionItem[] {
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
