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

import { NodeType } from '../../../../dtsTypes/types';
import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../helpers';

export async function dtPhandelByNameRaw(
	node: Node | undefined,
	propertyName: string,
	name: string,
) {
	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	if (!property) {
		return;
	}

	const nodeType = property.parent.nodeType;

	if (!nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	const specifierSpace = property.nexusMapsTo.at(0)?.specifierSpace;
	const nameValues = specifierSpace
		? property.parent.getProperty(`${specifierSpace}-names`)?.ast
				.quickValues
		: undefined;

	const idx =
		nameValues?.findIndex(
			(n) => typeof n === 'string' && n.toLowerCase() === name,
		) ?? -1;

	if (idx === -1) {
		return;
	}

	const nexusMapping = property.nexusMapsTo.at(idx);
	return nexusMapping?.target;
}
