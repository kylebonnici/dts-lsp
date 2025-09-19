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
import { toCIdentifier } from '../../../../dtMacro/helpers';

export async function dtEnumIndexByIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: number,
) {
	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	if (!property) {
		return;
	}

	const value = property?.ast.quickValues?.at(idx);

	const nodeType = property.parent.nodeType;

	if (Array.isArray(value) || !nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	const propType = nodeType.properties.find((p) =>
		p.getNameMatch(property.name),
	);

	const enumIdx =
		propType?.values(property).findIndex((v) => v === value) ?? -1;

	return enumIdx === -1 ? undefined : enumIdx;
}
