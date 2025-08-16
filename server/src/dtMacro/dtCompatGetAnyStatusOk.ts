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

import { Node } from '../context/node';
import { ContextAware } from '../runtimeEvaluator';
import { toCIdentifier } from './helpers';

const get = (node: Node, compat: string): Node[] => {
	return node.nodes
		.filter((n) => !n.disabled && n.nodeType)
		.flatMap((n) =>
			[n.nodeType!.compatible, ...Array.from(n.nodeType!.extends)]
				.filter((v) => !!v)
				.map((c) => toCIdentifier(c!))
				.includes(compat)
				? [n, ...get(n, compat)]
				: get(n, compat),
		);
};

export async function resolveDtCompatGetAnyStatusOk(
	compat: string,
	context: ContextAware,
): Promise<Node[] | undefined> {
	const runtime = await context?.getRuntime();

	if (runtime) {
		const nodes = get(runtime.rootNode, compat);
		return nodes;
	}
}
