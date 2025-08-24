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
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo } from '../../helpers';
import { genericPropertyCompletion } from './genericProp';
import { getCellNameCompletion } from './dtPha';

export async function dtPhaOrComplitions(
	document: TextDocument,
	context: ContextAware,
	macro: DTMacroInfo,
	position: Position,
): Promise<CompletionItem[]> {
	if (macro.argIndexInParent === 2) {
		return getCellNameCompletion(
			document,
			context,
			macro,
			position,
			'DT_PHA_OR',
			2,
			0,
		);
	}

	return genericPropertyCompletion(
		document,
		context,
		macro,
		position,
		'DT_PHA_OR',
		1,
		3,
		(prop) => !!prop.nexusMapsTo.length,
	);
}
