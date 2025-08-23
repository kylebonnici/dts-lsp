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

import {
	CompletionItem,
	TextDocumentPositionParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../runtimeEvaluator';
import { getMacroAtPosition } from '../helpers';
import { dtAliasComplitions } from './nodes/dtAlias';

export async function getCompletions(
	location: TextDocumentPositionParams,
	context: ContextAware,
	document: TextDocument | undefined,
): Promise<CompletionItem[]> {
	if (!document) return [];

	const macro = getMacroAtPosition(document, location.position);
	const runtime = await context.getRuntime();

	if (!macro) {
		return [];
	}

	return [...dtAliasComplitions(macro, runtime)];
}
