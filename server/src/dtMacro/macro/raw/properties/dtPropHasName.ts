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

import { ContextAware } from '../../../../runtimeEvaluator';
import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../../dtMacro/helpers';
import { NodeType } from '../../../../dtsTypes/types';
import { dtPropRaw } from './dtProp';

export async function dtPropHasNameRaw(
	node: Node | undefined,
	propertyName: string,
	nameValue: string,
	context: ContextAware,
) {
	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	const nodeType = property?.parent.nodeType;

	if (!nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	const values = await dtPropRaw(node, propertyName, context);

	if (values === undefined) {
		return;
	}

	const specifierSpace = property.nexusMapsTo.at(0)?.specifierSpace;
	const nameValues = specifierSpace
		? property.parent.getProperty(`${specifierSpace}-names`)?.ast
				.quickValues
		: undefined;

	const idx =
		nameValues?.findIndex(
			(name) =>
				typeof name === 'string' && name.toLowerCase() === nameValue,
		) ?? -1;

	return idx === -1 ? undefined : idx;
}
