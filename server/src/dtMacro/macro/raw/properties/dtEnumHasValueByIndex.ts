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

import util from 'util';
import { evalExp } from '../../../../helpers';
import { toCIdentifier } from '../../../../dtMacro/helpers';
import { Node } from '../../../../context/node';

export async function dtEnumHasValueByIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: number,
	cmpValue: string,
) {
	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	if (!property) {
		return;
	}

	const value = property?.ast.quickValues?.at(idx);

	if (value === undefined) {
		return;
	}

	return util.isDeepStrictEqual(evalExp(cmpValue), value);
}
