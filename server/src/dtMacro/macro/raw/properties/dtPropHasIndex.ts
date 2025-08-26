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

import { ContextAware } from '../../../../runtimeEvaluator';
import { Node } from '../../../../context/node';
import { evalExp } from '../../../../helpers';
import { dtPropRaw } from './dtProp';

export async function dtPropHasIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: number | string,
	context: ContextAware,
) {
	const values = await dtPropRaw(node, propertyName, context);

	if (values === undefined) {
		return false;
	}

	idx = typeof idx === 'number' ? idx : evalExp(idx ?? '0');

	if (typeof idx !== 'number') {
		return;
	}

	if (Array.isArray(values)) {
		return values.length < idx;
	}

	return idx === 0;
}
