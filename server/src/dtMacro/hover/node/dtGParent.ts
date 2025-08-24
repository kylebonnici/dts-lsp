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

import { Hover } from 'vscode-languageserver';
import { dtGParent } from '../../../dtMacro/macro/node/dtGParent';
import { ResolveMacroRequest } from '../../helpers';
import { dtMacroToNode } from '../../../dtMacro/macro/dtMacroToNode';

export async function dtGParentHover(
	resolveMacroRequest: ResolveMacroRequest,
): Promise<Hover | undefined> {
	let gParent = await dtGParent(resolveMacroRequest, dtMacroToNode);

	if (!gParent) {
		return;
	}
	return {
		contents: gParent.toMarkupContent(resolveMacroRequest.context.macros),
	};
}
