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

import { MarkupKind } from 'vscode-languageserver-types';
import { ContextAware } from '../../../runtimeEvaluator';
import { dtAlias } from './dtAlias';

export async function dtHasAlias(alias: string, context: ContextAware) {
	const aliasNode = await dtAlias(alias, context);

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: !!aliasNode ? '1' : '0',
		},
	};
}
