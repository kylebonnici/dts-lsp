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

import { LabelRef } from '../../../../ast/dtc/labelRef';
import { evalExp } from '../../../../helpers';
import { NodePathRef } from '../../../../ast/dtc/values/nodePath';
import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../helpers';

export async function dtPhandelByIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: string | number = 0,
) {
	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	idx = typeof idx === 'number' ? idx : evalExp(idx ?? '0');

	if (typeof idx !== 'number') {
		return;
	}

	const value = property?.ast.getFlatAstValues()?.at(idx);

	if (value instanceof LabelRef) {
		return value.linksTo;
	}

	if (value instanceof NodePathRef) {
		return value.path?.pathParts.at(-1)?.linksTo;
	}
}
