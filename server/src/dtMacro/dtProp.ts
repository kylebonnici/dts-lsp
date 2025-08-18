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
import { LabelRef } from 'src/ast/dtc/labelRef';
import { StringValue } from 'src/ast/dtc/values/string';
import { Expression } from 'src/ast/cPreprocessors/expression';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { ContextAware } from '../runtimeEvaluator';
import { Node } from '../context/node';
import { DTMacroInfo, toCIdentifier } from './helpers';

export async function dtPropValuesWithNodeId(
	context: ContextAware,
	node: Node,
	propertyName: string,
) {
	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	const values = property?.ast.getFlatAstValues();
	if (values?.length === 0) {
		return true;
	}

	return (
		values?.map((v) => {
			if (v instanceof NodePathRef) {
				return v.path?.pathParts.at(-1)?.linksTo;
			}
			if (v instanceof LabelRef) {
				return v.linksTo;
			}
			if (v instanceof StringValue) {
				return v.value;
			}
			if (v instanceof Expression) {
				const evaluated = v.evaluate(context.macros);

				return typeof evaluated === 'number' ? evaluated : v.toString();
			}
		}) ?? false
	);
}

export async function resolveDtPropValues(
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
	if (args?.length !== (macro.macro === 'DT_PROP' ? 2 : 3)) return;

	const runtime = await context?.getRuntime();

	if (runtime) {
		const node = await resolveDTMacroToNode(
			document,
			args[0],
			context,
			position,
		);

		return node
			? dtPropValuesWithNodeId(context, node, args[1].macro)
			: undefined;
	}
}

export async function resolveDtPropNode(
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
	const values = await resolveDtPropValues(
		document,
		macro,
		context,
		position,
		resolveDTMacroToNode,
	);

	if (typeof values === 'boolean') {
		return;
	}

	const node = values?.at(0);

	if (values?.length === 1 && node instanceof Node) {
		return node;
	}
}
