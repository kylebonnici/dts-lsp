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
import { ContextAware } from '../../../../runtimeEvaluator';
import { toCIdentifier } from '../../../helpers';

const get = (node: Node, path: string[]): Node | undefined => {
	if (!path.length) return node;

	const p = path.splice(0, 1)[0];
	const n = node.nodes.find((n) => toCIdentifier(n.fullName) === p);
	return n ? get(n, path) : undefined;
};

export async function dtPathRaw(path: string[], context: ContextAware) {
	const runtime = await context?.getRuntime();

	if (runtime) {
		return get(runtime.rootNode, path);
	}
}
