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

import { MarkupKind, Position } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextAware } from '../../../runtimeEvaluator';
import { DTMacroInfo, toCIdentifier } from '../../helpers';
import { resolveDTMacroToNode } from '../../dtMacroToNode';

export async function dtNodeFullName(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
	type: 'Quoted' | 'Unquoted' | 'Token' | 'Upper Token',
) {
	if (macro.args?.length !== 1) {
		return;
	}
	const node = await resolveDTMacroToNode(
		document,
		macro.args[0],
		context,
		position,
	);

	if (!node) {
		return;
	}

	let value = '';

	switch (type) {
		case 'Unquoted':
			value = node.fullName;
			break;
		case 'Quoted':
			value = `"${node.fullName}"`;
			break;
		case 'Token':
			value = toCIdentifier(node.fullName);
			break;
		case 'Upper Token':
			value = toCIdentifier(node.fullName).toUpperCase();
			break;
	}

	return {
		contents: {
			kind: MarkupKind.Markdown,
			value,
		},
	};
}
