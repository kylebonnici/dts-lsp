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

import { CompletionItem, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { dtMacroToNode } from 'src/dtMacro/macro/dtMacroToNode';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { dtPhandel } from '../../../dtMacro/macro/properties/dtPhandel';
import { genericPropertyCompletion } from './genericProp';
import { dtPhandleComplitions } from './dtPhandle';

export async function dtPropByPhaComplitions(
	document: TextDocument,
	context: ContextAware,
	macro: DTMacroInfo,
	position: Position,
): Promise<CompletionItem[]> {
	if (
		macro.argIndexInParent === 1 &&
		'DT_PROP_BY_PHANDLE' === macro.parent?.macro
	) {
		return dtPhandleComplitions(
			document,
			context,
			{
				...macro,
				parent: macro.parent
					? {
							...macro.parent,
							macro: 'DT_PHANDLE',
						}
					: undefined,
			},
			position,
		);
	}

	return genericPropertyCompletion(
		document,
		context,
		macro,
		position,
		'DT_PROP_BY_PHANDLE',
		2,
		3,
		undefined,
		() =>
			dtPhandel(
				document,
				{
					macro: 'DT_PHANDLE',
					args: macro.parent?.args?.slice(0, 2),
				},
				context,
				position,
				dtMacroToNode,
			),
	);
}
