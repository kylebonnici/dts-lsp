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

import { Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LabelRef } from '../ast/dtc/labelRef';
import { ContextAware } from '../runtimeEvaluator';
import { evalExp } from '../helpers';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { Node } from '../context/node';
import { DTMacroInfo, toCIdentifier } from './helpers';

export async function resolveDtPhandelByIndex(
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
) {
	const args = macro.args;
	if (args?.length !== (macro.macro === 'DT_PHANDLE_BY_IDX' ? 3 : 2)) {
		return;
	}

	const node = await resolveDTMacroToNode(
		document,
		args[0],
		context,
		position,
	);

	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === args[1].macro,
	);

	const idx = evalExp(args.at(2)?.macro ?? '0');

	if (!property || typeof idx !== 'number') {
		return;
	}

	const value = property.ast.getFlatAstValues()?.at(idx);

	if (value instanceof LabelRef) {
		return value.linksTo;
	}

	if (value instanceof NodePathRef) {
		return value.path?.pathParts.at(-1)?.linksTo;
	}
}
