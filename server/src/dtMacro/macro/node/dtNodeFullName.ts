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

import { Node } from '../../../context/node';
import { ResolveMacroRequest } from '../../helpers';
import { dtNodeFullNameRaw } from '../raw/node/dtNodeFullName';

export async function dtNodeFullName(
	{ document, macro, context, position }: ResolveMacroRequest,
	dtMacroToNode: (
		resolveMacroRequest: ResolveMacroRequest,
	) => Promise<Node | undefined>,
) {
	if (macro.args?.length !== 1) {
		return;
	}
	const node = await dtMacroToNode({
		document,
		macro: macro.args[0],
		context,
		position,
	});

	switch (macro.macro) {
		case 'DT_NODE_FULL_NAME':
			return dtNodeFullNameRaw(node, 'Quoted');
		case 'DT_NODE_FULL_NAME_TOKEN':
			return dtNodeFullNameRaw(node, 'Token');
		case 'DT_NODE_FULL_NAME_UNQUOTED':
			return dtNodeFullNameRaw(node, 'Unquoted');
		case 'DT_NODE_FULL_NAME_UPPER_TOKEN':
			return dtNodeFullNameRaw(node, 'Upper Token');
	}
}
