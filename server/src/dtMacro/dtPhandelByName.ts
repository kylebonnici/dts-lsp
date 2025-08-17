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
import { NodeType } from 'src/dtsTypes/types';
import { Property } from 'src/context/property';
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import { DTMacroInfo, toCIdentifier } from './helpers';

async function getPhandelByName(name: string, property: Property) {
	const nodeType = property.parent.nodeType;

	if (!nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	const specifierSpace = property.nexusMapsTo.at(0)?.specifierSpace;
	const nameValues = specifierSpace
		? property.parent.getProperty(`${specifierSpace}-names`)?.ast
				.quickValues
		: undefined;

	const idx = nameValues?.findIndex(
		(n) => typeof n === 'string' && n.toLowerCase() === name,
	);

	if (idx === undefined) {
		return;
	}

	const nexusMapping = property.nexusMapsTo.at(idx);
	return nexusMapping?.target;
}

export async function resolverDtPhandelByName(
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
	if (args?.length !== 3) {
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

	if (!property) {
		return;
	}

	return await getPhandelByName(args[2].macro, property);
}
