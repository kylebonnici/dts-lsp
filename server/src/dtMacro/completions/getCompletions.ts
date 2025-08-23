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
