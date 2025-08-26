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
import { dtPropRaw } from './dtProp';

export async function dtPropLastRaw(
	node: Node | undefined,
	propertyName: string,
	context: ContextAware,
) {
	const values = await dtPropRaw(node, propertyName, context);

	if (values === true) {
		return true;
	}

	if (!values) {
		return;
	}

	const value = values.at(-1);

	if (!value) {
		return;
	}

	if (values.length === 1 && values[0] instanceof Node) {
		return values[0];
	}

	return value;
}
