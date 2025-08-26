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

import { toCIdentifier } from '../../../helpers';
import { Node } from '../../../../context/node';

export async function dtNodeFullNameRaw(
	node: Node | undefined,
	type: 'Quoted' | 'Unquoted' | 'Token' | 'Upper Token',
) {
	if (!node) {
		return;
	}

	switch (type) {
		case 'Unquoted':
			return node.fullName;
		case 'Quoted':
			return `"${node.fullName}"`;
		case 'Token':
			return toCIdentifier(node.fullName);
		case 'Upper Token':
			return toCIdentifier(node.fullName).toUpperCase();
	}
}
