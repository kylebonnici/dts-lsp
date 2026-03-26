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
import { DeleteProperty } from '../ast/dtc/deleteProperty';
import { DtcProperty } from '../ast/dtc/property';
import { ASTBase } from '../ast/base';
import { FileDiagnostic, FormattingIssues } from '../types';
import {
	applyEdits,
	genFormattingDiagnostic,
	toPosition,
	toRangeWithTokenIndex,
} from '../helpers';

import { DtcBaseNode } from '../ast/dtc/node';
import { FormattingFlags } from '../types/index';
import type { CustomDocumentFormattingParams } from './types';
import { filterOnOffEdits, pairFormatOnOff } from './helpers';

export async function removeDuplicateProperties(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'File Diagnostics',
	formattingOptions: FormattingFlags,
): Promise<FileDiagnostic[]>;
export async function removeDuplicateProperties(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text',
	formattingOptions: FormattingFlags,
): Promise<string>;
export async function removeDuplicateProperties(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics',
	formattingOptions: FormattingFlags,
): Promise<string | FileDiagnostic[]> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	let newText = text;

	const edits = await baseRemoveDuplicateProperties(
		astItems,
		formattingOptions,
	);

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

async function baseRemoveDuplicateProperties(
	astItems: ASTBase[],
	formattingOptions: FormattingFlags,
): Promise<FileDiagnostic[]> {
	return (
		await Promise.all(
			astItems
				.flatMap((ast) => [ast, ...ast.allDescendants])
				.flatMap(async (item) => {
					if (
						formattingOptions.removeEmptyReferences &&
						item instanceof DtcBaseNode
					) {
						const props = new Map<
							string,
							{ property: DtcProperty; delete?: DeleteProperty }[]
						>();
						item.children.forEach((child, index) => {
							if (child instanceof DtcProperty) {
								const name = child.propertyName.name;
								let p = props.get(name);
								if (!p) {
									p = [];
									props.set(name, p);
								}

								let deleteProp: DeleteProperty | undefined;
								for (
									let i = index + 1;
									i < item.children.length;
									i++
								) {
									const c = item.children[i];
									if (
										c instanceof DtcProperty &&
										c.propertyName.name === name
									) {
										break;
									}
									if (c instanceof DeleteProperty) {
										deleteProp = c;
										break;
									}
								}

								p.push({
									property: child,
									delete: deleteProp,
								});
							}
						});

						return Array.from(props.values()).flatMap(
							(propList) => {
								if (propList.length > 1) {
									return propList
										.slice(0, -1)
										.flatMap((prop) => {
											const propFirstToken =
												prop.property.topComment
													?.firstToken ??
												prop.property.firstToken;
											const propLastToken =
												prop.property.endComment
													?.lastToken ??
												prop.property.lastToken;

											const edits: TextEdit[] = [];
											edits.push(
												TextEdit.del(
													toRangeWithTokenIndex(
														propFirstToken.prevToken,
														propLastToken,
														!propFirstToken.prevToken,
													),
												),
											);

											if (prop.delete) {
												const delFirstToken =
													prop.delete.firstToken;
												const delLastToken =
													prop.delete.lastToken;

												edits.push(
													TextEdit.del(
														toRangeWithTokenIndex(
															delFirstToken.prevToken,
															delLastToken,
															!delFirstToken.prevToken,
														),
													),
												);
											}

											return genFormattingDiagnostic(
												FormattingIssues.DUPLICATE_PROPERTY,
												prop.property.fsPath,
												toPosition(
													propFirstToken,
													false,
												),
												{
													edit: edits,
													codeActionTitle: `Delete property`,
												},
												toPosition(propLastToken),
											);
										});
								}
							},
						);
					}
				}),
		)
	)
		.flat()
		.filter((i) => !!i);
}
