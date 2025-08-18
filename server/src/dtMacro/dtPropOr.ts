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
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import { DTMacroInfo } from './helpers';
import { resolveDtPropRaw } from './dtProp';

export async function resolveDtPropOrRaw(
	node: Node | undefined,
	propertyName: string,
	fallback: DTMacroInfo,
	document: TextDocument,
	context: ContextAware,
	position: Position,
	resolveDTMacroToNode: (
		document: TextDocument,
		macro: DTMacroInfo,
		context: ContextAware,
		position: Position,
	) => Promise<Node | undefined>,
) {
	const result = await resolveDtPropRaw(node, propertyName, context);

	return (
		result ?? resolveDTMacroToNode(document, fallback, context, position)
	);
}

export async function resolveDtPropOr(
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
	if (macro.args?.length !== 3) {
		return;
	}

	const [nodeId, prop, fallback] = macro.args;
	const node = await resolveDTMacroToNode(
		document,
		nodeId,
		context,
		position,
	);

	return await resolveDtPropOrRaw(
		node,
		prop.macro,
		fallback,
		document,
		context,
		position,
		resolveDTMacroToNode,
	);
}

export async function resolveDtPropOrNode(
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
	const values = await resolveDtPropOr(
		document,
		macro,
		context,
		position,
		resolveDTMacroToNode,
	);

	if (values instanceof Node) {
		return values;
	}

	if (typeof values === 'boolean') {
		return;
	}

	const node = values?.at(0);

	if (values?.length === 1 && node instanceof Node) {
		return node;
	}
}
