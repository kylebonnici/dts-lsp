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

import { ContextAware } from 'src/runtimeEvaluator';
import { LabelRef } from 'src/ast/dtc/labelRef';
import { NodePathRef } from 'src/ast/dtc/values/nodePath';
import { toCIdentifier } from '../../../../dtMacro/helpers';
import { Node } from '../../../../context/node';

export async function dtChosenRaw(
	context: ContextAware,
	propertyName: string,
): Promise<Node | undefined> {
	const node = (await context.getRuntime()).rootNode.getChild([
		'/',
		'chosen',
	]);
	if (!node) {
		return;
	}

	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	const values = property?.ast.getFlatAstValues();
	const value = values?.at(0);
	if (value instanceof LabelRef) {
		return value.linksTo;
	}

	if (value instanceof NodePathRef) {
		return value.path?.pathParts.at(-1)?.linksTo;
	}
}
