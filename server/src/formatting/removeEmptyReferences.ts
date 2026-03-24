/*
 * Copyright 2026 Kyle Micallef Bonnici
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

import { TextDocument } from 'vscode-languageserver-textdocument';
import { TextEdit } from 'vscode-languageserver';
import { ASTBase } from '../ast/base';
import { FileDiagnostic, FormattingIssues } from '../types';
import {
	applyEdits,
	genFormattingDiagnostic,
	toPosition,
	toRangeWithTokenIndex,
} from '../helpers';

import { DtcRefNode } from '../ast/dtc/node';
import type { CustomDocumentFormattingParams } from './types';
import { filterOnOffEdits, pairFormatOnOff } from './helpers';

export async function formatEmptyReferences(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'File Diagnostics',
): Promise<FileDiagnostic[]>;
export async function formatEmptyReferences(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text',
): Promise<string>;
export async function formatEmptyReferences(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics',
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	let newText = text;

	const edits = await baseEmptyReferences(astItems);

	const rangeEdits = filterOnOffEdits(
		formatOnOffMeta,
		documentFormattingParams,
		edits,
	);

	newText = applyEdits(
		TextDocument.create(fsPath, 'devicetree', 0, text),
		rangeEdits.flatMap((i) => i.raw.edit).filter((e) => !!e),
	);

	switch (returnType) {
		case 'New Text':
			return newText;
		case 'File Diagnostics':
			return rangeEdits;
	}
}

async function baseEmptyReferences(
	astItems: ASTBase[],
): Promise<FileDiagnostic[]> {
	return (
		await Promise.all(
			astItems.flatMap(async (item) => {
				if (
					item instanceof DtcRefNode &&
					!item.labels.length &&
					item.openScope?.nextToken === item.closeScope
				) {
					const firstToken =
						item.topComment?.firstToken ?? item.firstToken;
					const lastToken =
						item.endComment?.lastToken ?? item.lastToken;

					if (firstToken.prevToken?.prevToken) {
						firstToken.prevToken.prevToken.nextToken = undefined;
					}
					if (lastToken.nextToken) {
						lastToken.nextToken = undefined;
					}

					return [
						genFormattingDiagnostic(
							FormattingIssues.EMPTY_NODE_REFERENCE,
							item.fsPath,
							toPosition(firstToken, false),
							{
								edit: TextEdit.del(
									toRangeWithTokenIndex(
										firstToken.prevToken,
										lastToken,
										!firstToken.prevToken,
									),
								),
								codeActionTitle: `Delete unnecessary node reference`,
							},
							toPosition(lastToken),
						),
					];
				}
			}),
		)
	)
		.flat()
		.filter((i) => !!i);
}
