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

import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../helpers';
import { StringValue } from '../../../../ast/dtc/values/string';

export async function dtStringUnquotedRaw(
	node: Node | undefined,
	propertyName: string,
) {
	if (!node) {
		return;
	}

	const property = node?.property.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	const values = property?.ast.getFlatAstValues();
	if (values?.length !== 1) {
		return;
	}

	if (values[0] instanceof StringValue) {
		return values[0].value;
	}
}
