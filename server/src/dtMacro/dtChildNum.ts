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

import { Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import { DTMacroInfo } from './helpers';

export async function resolveDtChildNum(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
	resolveDTMacroToNode: (
		document: TextDocument,
		macro: DTMacroInfo,
		context: ContextAware,
		position: Position,
	) => Promise<Node | undefined>,
	statusOk?: boolean,
) {
	if (macro.args?.length !== 1) return;

	const runtime = await context?.getRuntime();

	if (runtime) {
		const node = await resolveDTMacroToNode(
			document,
			macro.args[0],
			context,
			position,
		);

		if (!node) {
			return;
		}

		if (statusOk) {
			return node.nodes.filter((n) => !n.disabled).length;
		}

		return node.nodes.length;
	}
}
