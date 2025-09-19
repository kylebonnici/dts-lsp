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

import { ResolveMacroRequest } from '../../helpers';
import { dtPropRaw } from '../raw/properties/dtProp';
import { dtPhandleByIndexRaw } from '../raw/properties/dtPhandleByIndex';
import { Node } from '../../../context/node';

export async function dtPropByPhandleIndex(
	{ document, macro, context, position }: ResolveMacroRequest,
	dtMacroToNode: (
		resolveMacroRequest: ResolveMacroRequest,
	) => Promise<Node | undefined>,
) {
	if (macro.macro !== 'DT_PROP_BY_PHANDLE_IDX' || macro.args?.length !== 4) {
		return;
	}

	const handle = await dtPhandleByIndexRaw(
		await dtMacroToNode({
			document,
			macro: macro.args[0],
			context,
			position,
		}),
		macro.args[1].macro,
		macro.args[2].macro,
	);

	return await dtPropRaw(handle, macro.args[3].macro, context);
}
