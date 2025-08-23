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

import { toCIdentifier } from '../../../../dtMacro/helpers';
import { Node } from '../../../../context/node';
import { Runtime } from '../../../../context/runtime';
import { StringValue } from '../../../../ast/dtc/values/string';
import { LabelRef } from '../../../../ast/dtc/labelRef';
import { NodePathRef } from '../../../../ast/dtc/values/nodePath';
import { ContextAware } from '../../../../runtimeEvaluator';

export async function dtAliasRaw(alias: string, context: ContextAware) {
	const runtime = await context?.getRuntime();

	if (runtime) {
		let node: Node | undefined = Runtime.getNodeFromPath(
			['aliases'],
			runtime.rootNode,
			true,
		);

		const property = node?.property.find(
			(p) => toCIdentifier(p.name) === alias,
		);

		if (!property) {
			return;
		}

		const values = property.ast.getFlatAstValues();

		if (values?.[0] instanceof StringValue) {
			node = runtime.rootNode.getChild(values[0].value.split('/'));
		} else if (values?.[0] instanceof LabelRef) {
			node = values[0].linksTo;
		} else if (values?.[0] instanceof NodePathRef) {
			node = values[0].path?.pathParts.at(-1)?.linksTo;
		}

		return node;
	}
}
