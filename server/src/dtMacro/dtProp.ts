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
import { ResolveMacroRequest } from './helpers';
import { dtProp } from './macro/properties/dtProp';

export async function dtPropNode(
	resolveMacroRequest: ResolveMacroRequest,
	resolveDTMacroToNode: (
		resolveMacroRequest: ResolveMacroRequest,
	) => Promise<Node | undefined>,
) {
	const values = await dtProp(resolveMacroRequest, resolveDTMacroToNode);

	if (typeof values === 'boolean') {
		return;
	}

	const node = values?.at(0);

	if (values?.length === 1 && node instanceof Node) {
		return node;
	}
}
