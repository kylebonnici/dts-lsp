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
import { ResolveMacroRequest } from '../../../helpers';
import { dtPropRaw } from './dtProp';
import { dtOrRaw } from './dtOr';

export async function dtPropOrRaw(
	node: Node | undefined,
	propertyName: string,
	resolveMacroRequest: ResolveMacroRequest,
	dtMacroToNode: (
		resolveMacroRequest: ResolveMacroRequest,
	) => Promise<Node | undefined>,
) {
	return dtOrRaw(
		await dtPropRaw(node, propertyName, resolveMacroRequest.context),
		resolveMacroRequest,
		dtMacroToNode,
	);
}
