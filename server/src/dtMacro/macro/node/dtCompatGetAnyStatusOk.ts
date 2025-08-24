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
import { dtCompatGetAnyStatusOkRaw } from '../raw/node/dtCompatGetAnyStatusOk';

export async function dtCompatGetAnyStatusOk({
	macro,
	context,
}: ResolveMacroRequest) {
	if (
		macro.macro !== 'DT_COMPAT_GET_ANY_STATUS_OKAY' ||
		macro.args?.length !== 1
	)
		return;

	return dtCompatGetAnyStatusOkRaw(macro.args[0].macro, context);
}

export async function dtCompatGetAnyStatusOkNode(
	resolveMacroRequest: ResolveMacroRequest,
) {
	return (await dtCompatGetAnyStatusOk(resolveMacroRequest))?.at(0);
}
