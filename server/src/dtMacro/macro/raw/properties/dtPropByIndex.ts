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
import { StringValue } from '../../../../ast/dtc/values/string';
import { Expression } from '../../../../ast/cPreprocessors/expression';
import { NodePathRef } from '../../../../ast/dtc/values/nodePath';
import { ContextAware } from '../../../../runtimeEvaluator';
import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../helpers';

export async function dtPropByIndexRaw(
	node: Node | undefined,
	propertyName: string,
	context: ContextAware,
) {
	if (!node) {
		return;
	}

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
