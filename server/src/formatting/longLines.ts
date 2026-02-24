/*
 * Copyright 2024 Kyle Micallef Bonnici
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

import { Range, TextEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DtcBaseNode, DtcChildNode, DtcRefNode } from '../ast/dtc/node';
import { DtcProperty } from '../ast/dtc/property';
import { ASTBase } from '../ast/base';
import { FileDiagnostic, FormattingIssues, Token } from '../types';
import { PropertyValues } from '../ast/dtc/values/values';
import { PropertyValue } from '../ast/dtc/values/value';
import { ArrayValues } from '../ast/dtc/values/arrayValue';
import { ByteStringValue } from '../ast/dtc/values/byteString';
import {
	applyEdits,
	genFormattingDiagnostic,
	sameLine,
	toPosition,
} from '../helpers';
import {
	ComplexExpression,
	Expression,
} from '../ast/cPreprocessors/expression';
import { CMacroCall } from '../ast/cPreprocessors/functionCall';
import { LabelAssign } from '../ast/dtc/label';
import type {
	CustomDocumentFormattingParams,
	FormattingFlags,
	FormattingSettings,
	LevelMeta,
} from './types';
import {
	createIndentString,
	filterOnOffEdits,
	getAstItemLevel,
	getExpressionCol,
	pairFormatOnOff,
	widthToPrefix,
} from './helpers';

function needWrapping(
	firstToken: Token,
	lastToken: Token,
	settings: FormattingSettings,
	documentLines: string[],
) {
	if (!sameLine(firstToken, lastToken)) {
		let prevToken = lastToken.prevToken;
		while (firstToken !== prevToken) {
			if (prevToken && sameLine(firstToken, prevToken)) {
				if (
					needWrapping(firstToken, prevToken, settings, documentLines)
				) {
					return true;
				}
			}
			prevToken = prevToken?.prevToken;
		}
		return null;
	}

	const lineText = documentLines[firstToken.pos.line].slice(
		0,
		lastToken.pos.colEnd,
	);

	const length = lineText.replace(/^\s+/, (prefix) =>
		prefix.replace(/\t/g, ' '.repeat(settings.tabSize)),
	).length;

	if (length > settings.wordWrapColumn) {
		return true;
	}

	return false;
}

export async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'File Diagnostics',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<FileDiagnostic[]>;
export async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<string>;
export async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics',
	options: FormattingFlags,
	edits: FileDiagnostic[] = [],
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	let newText = text;

	edits.push(
		...(await baseLongLineItems(
			documentFormattingParams,
			astItems,
			fsPath,
			splitDocument,
			options,
		)),
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

async function baseLongLineItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	splitDocument: string[],
	options: FormattingFlags,
): Promise<FileDiagnostic[]> {
	const astItemLevel = getAstItemLevel(astItems, fsPath);

	const result: FileDiagnostic[] = (
		await Promise.all(
			astItems.flatMap(
				async (base) =>
					await getWrapLineEdit(
						documentFormattingParams,
						base,
						fsPath,
						astItemLevel,
						splitDocument,
						options,
					),
			),
		)
	).flat();

	return result;
}

const getWrapLineEdit = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	astNode: ASTBase,
	fsPath: string,
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
	documentText: string[],
	options: FormattingFlags,
	level = 0,
): Promise<FileDiagnostic[]> => {
	const delta = documentFormattingParams.options.tabSize;
	const insertSpaces = documentFormattingParams.options.insertSpaces;
	const singleIndent = insertSpaces ? ' '.repeat(delta) : '\t';
	const settings: FormattingSettings = {
		tabSize: delta,
		insertSpaces,
		singleIndent,
		wordWrapColumn: documentFormattingParams.options.wordWrapColumn,
	};

	if (astNode instanceof DtcBaseNode) {
		return formatLongLinesDtcNode(
			documentFormattingParams,
			astNode,
			fsPath,
			level,
			settings,
			options,
			documentText,
			computeLevel,
		);
	} else if (astNode instanceof DtcProperty) {
		return formatLongLinesDtcProperty(
			astNode,
			level,
			settings,
			options,
			documentText,
			singleIndent,
		);
	}

	return [];
};

const formatLongLinesDtcNode = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	node: DtcBaseNode,
	fsPath: string,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
): Promise<FileDiagnostic[]> => {
	const result: FileDiagnostic[] = [];

	if (node instanceof DtcChildNode || node instanceof DtcRefNode) {
		const labelsEdits = await formatLabels(
			node.labels,
			level,
			settings,
			documentText,
			settings.singleIndent,
		);

		if (labelsEdits.length > 0) {
			result.push(...labelsEdits);
		} else {
			const nameAst =
				node instanceof DtcChildNode ? node.name : node.reference;
			if (
				nameAst &&
				needWrapping(
					nameAst.firstToken,
					node.openScope ?? nameAst.lastToken,
					settings,
					documentText,
				)
			) {
				result.push(
					genFormattingDiagnostic(
						FormattingIssues.LONG_LINE_WRAP,
						fsPath,
						toPosition(nameAst.firstToken, false),
						{
							edit: [
								TextEdit.replace(
									Range.create(
										toPosition(
											nameAst.firstToken.prevToken!,
										),
										toPosition(nameAst.firstToken, false),
									),
									`\n${createIndentString(
										level,
										settings.singleIndent,
									)}`,
								),
							],
							codeActionTitle: `Move ...${nameAst.toString()}... to a new line`,
						},
					),
				);
			}
		}
	}

	result.push(
		...(
			await Promise.all(
				node.children.flatMap((c) =>
					getWrapLineEdit(
						documentFormattingParams,
						c,
						fsPath,
						computeLevel,
						documentText,
						options,
						level + 1,
					),
				),
			)
		).flat(),
	);

	return result;
};

const formatLabels = (
	labels: LabelAssign[],
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	const labelToWrapIndex = labels.findIndex((label) =>
		needWrapping(label.firstToken, label.lastToken, settings, documentText),
	);

	if (labelToWrapIndex === -1) {
		return [];
	}

	const labelToWrap = labels[labelToWrapIndex];
	const labelToPull = labels.find(
		(label, index) =>
			index > labelToWrapIndex &&
			label.firstToken.pos.line !== labelToWrap.lastToken.pos.line,
	);

	return [
		genFormattingDiagnostic(
			FormattingIssues.LONG_LINE_WRAP,
			labelToWrap.firstToken.fsPath,
			toPosition(labelToWrap.firstToken, false),
			{
				edit: [
					TextEdit.replace(
						Range.create(
							toPosition(labelToWrap.firstToken.prevToken!),
							toPosition(labelToWrap.firstToken, false),
						),
						`\n${createIndentString(level, singleIndent)}`,
					),
					...(labelToPull
						? [
								TextEdit.replace(
									Range.create(
										toPosition(
											labelToPull.firstToken.prevToken!,
										),
										toPosition(
											labelToPull.firstToken,
											false,
										),
									),
									' ',
								),
							]
						: []),
				],
				codeActionTitle: `Move ...${labelToWrap.toString()}... to a new line`,
			},
		),
	];
};

const formatLongLinesDtcProperty = (
	property: DtcProperty,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	if (
		needWrapping(
			property.firstToken,
			property.lastToken,
			settings,
			documentText,
		) === false
	) {
		return [];
	}

	if (property.values) {
		return formatLongLinesPropertyValues(
			property,
			property.propertyName?.name.length ?? 0,
			property.values,
			level,
			settings,
			options,
			documentText,
			singleIndent,
			property.lastToken,
		);
	}

	return [];
};

const formatLongLinesPropertyValues = (
	property: DtcProperty,
	propertyNameWidth: number,
	values: PropertyValues,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	singleIndent: string,
	semicolon?: Token,
): FileDiagnostic[] => {
	for (const [index, value] of values.values.entries()) {
		if (!value) continue;

		const wrapEdits = formatLongLinesPropertyValue(
			propertyNameWidth,
			value,
			values.values,
			index,
			level,
			settings,
			options,
			documentText,
			singleIndent,
			index === values.values.length - 1 &&
				value.lastToken.nextToken === semicolon
				? semicolon
				: undefined,
		);

		if (wrapEdits) {
			return wrapEdits;
		}
	}

	return [];
};

const getFirstToken = (value: ASTBase) => {
	if (
		value instanceof ArrayValues ||
		(value instanceof ByteStringValue && value.openBracket)
	) {
		return value.openBracket ?? value.firstToken;
	}

	return value.firstToken;
};

const formatLongLinesPropertyValue = (
	propertyNameWidth: number,
	value: PropertyValue,
	allValues: (PropertyValue | null)[],
	index: number,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	singleIndent: string,
	semicolon?: Token,
): FileDiagnostic[] | undefined => {
	const valueEnd = value.nextValueSeparator ?? semicolon ?? value.lastToken;
	const wrapping = needWrapping(
		value.firstToken,
		valueEnd,
		settings,
		documentText,
	);
	if (wrapping === false) {
		return;
	}

	if (wrapping === null) {
		// Value is on multiple lines so we need to go deeper
		const innerValue = value.value;

		if (
			innerValue instanceof ArrayValues ||
			innerValue instanceof ByteStringValue
		) {
			return formatLongLinesArrayValue(
				value,
				propertyNameWidth,
				innerValue,
				level,
				settings,
				options,
				documentText,
				singleIndent,
				valueEnd,
			);
		}

		if (innerValue instanceof Expression) {
			return formatLongLinesExpression(
				value,
				propertyNameWidth,
				innerValue,
				level,
				settings,
				options,
				documentText,
				singleIndent,
			);
		}

		return []; // TODO process one value at a time
	}

	const line = documentText[value.firstToken.pos.line].substring(
		0,
		value.firstToken.pos.col,
	);
	const a = Math.trunc((propertyNameWidth + 3) / settings.tabSize);
	const b = (propertyNameWidth + 3) % settings.tabSize;
	const minWidth2 = a + b + level;
	const minWidth =
		line.trimStart() !== '' ? level + propertyNameWidth + 3 : minWidth2; // ` = `
	// can we move the whole array to new line?
	if (value.firstToken.pos.col === minWidth) {
		// no we cannot we are already on new line
		const innerValue = value.value;

		if (
			innerValue instanceof ArrayValues ||
			innerValue instanceof ByteStringValue
		) {
			return formatLongLinesArrayValue(
				value,
				propertyNameWidth,
				innerValue,
				level,
				settings,
				options,
				documentText,
				singleIndent,
				valueEnd,
			);
		}

		if (innerValue instanceof Expression) {
			return formatLongLinesExpression(
				value,
				propertyNameWidth,
				innerValue,
				level,
				settings,
				options,
				documentText,
				singleIndent,
			);
		}

		return;
	}

	const otherItem = allValues
		.slice(index)
		.find((v) => v?.firstToken.pos.line !== value.firstToken.pos.line);

	return [
		genFormattingDiagnostic(
			FormattingIssues.LONG_LINE_WRAP,
			value.firstToken.fsPath,
			toPosition(value.firstToken, false),
			{
				edit: [
					TextEdit.replace(
						Range.create(
							toPosition(value.firstToken.prevToken!),
							toPosition(value.firstToken, false),
						),
						`\n${createIndentString(level, singleIndent, widthToPrefix(settings, propertyNameWidth + 3))}`,
					),
					...(otherItem // wrap other item up to recursively align using least line possible
						? [
								TextEdit.replace(
									Range.create(
										toPosition(
											getFirstToken(otherItem).prevToken!,
										),
										toPosition(
											getFirstToken(otherItem),
											false,
										),
									),
									' ',
								),
							]
						: []),
				],
				codeActionTitle: `Move ...${value.toString()}... to a new line`,
			},
			toPosition(value.lastToken),
		),
	];
};

const formatLongLinesArrayValue = (
	propertyValue: PropertyValue,
	propertyNameWidth: number,
	innerValue: ArrayValues | ByteStringValue,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	singleIndent: string,
	valueEnd?: Token,
): FileDiagnostic[] | undefined => {
	for (const [index, value] of innerValue.values.entries()) {
		const wrapping = needWrapping(
			value.firstToken,
			index === innerValue.values.length - 1
				? (valueEnd ?? value.lastToken)
				: value.lastToken,
			settings,
			documentText,
		);

		if (wrapping === false) {
			continue;
		}

		const isComplexExpression = value.value instanceof ComplexExpression;

		if (isComplexExpression) {
			return formatLongLinesExpression(
				propertyValue,
				propertyNameWidth,
				value.value,
				level,
				settings,
				options,
				documentText,
				singleIndent,
				index !== 0,
			);
		}

		if (index === 0) {
			// we cannot format this value.... as fist value must be on same line as ( or [
			return [];
		}

		const otherItem = innerValue.values
			.slice(index)
			.find((v) => v?.firstToken.pos.line !== value.firstToken.pos.line);

		return [
			genFormattingDiagnostic(
				FormattingIssues.LONG_LINE_WRAP,
				value.firstToken.fsPath,
				toPosition(value.firstToken, false),
				{
					edit: [
						TextEdit.replace(
							Range.create(
								toPosition(value.firstToken.prevToken!),
								toPosition(value.firstToken, false),
							),
							`\n${createIndentString(level, singleIndent, widthToPrefix(settings, propertyNameWidth + 4))}`,
						),
						...(otherItem // wrap other item up to recursively align using least line possible
							? [
									TextEdit.replace(
										Range.create(
											toPosition(
												getFirstToken(otherItem)
													.prevToken!,
											),
											toPosition(
												getFirstToken(otherItem),
												false,
											),
										),
										' ',
									),
								]
							: []),
					],
					codeActionTitle: `Move ...${value.toString()}... to a new line`,
				},
				toPosition(value.lastToken),
			),
		];
	}

	return;
};

const formatLongLinesExpression = (
	propertyValue: PropertyValue,
	propertyNameWidth: number,
	expressionRaw: Expression,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	indentString: string,
	canWrapWholeExpression = false,
	expressionLevel: number = 0,
): FileDiagnostic[] | undefined => {
	const map = new Map<Token, Expression>();
	expressionRaw.allDescendants.forEach((c) => {
		if (c instanceof Expression && !(c.parentNode instanceof CMacroCall)) {
			map.set(c.firstToken, c);
		}
	});

	const expression = Array.from(map.values()).find((e) =>
		needWrapping(e.firstToken, e.lastToken, settings, documentText),
	);

	if (!expression) {
		return;
	}

	const line = documentText[expression.firstToken.pos.line].substring(
		0,
		expression.firstToken.pos.col,
	);

	const expectedCol = options.runExpressionIndentationCheck
		? getExpressionCol(
				propertyValue,
				expression,
				settings,
				documentText,
				level,
				propertyNameWidth + 4,
				true,
			)
		: propertyNameWidth + 4;

	const a = Math.trunc(expectedCol / settings.tabSize);
	const b = expectedCol % settings.tabSize;
	const minWidth2 = a + b + level;
	const minWidth = line.trimStart() !== '' ? level + expectedCol : minWidth2; // ` = `
	if (canWrapWholeExpression && expression.firstToken.pos.col !== minWidth) {
		return [
			genFormattingDiagnostic(
				FormattingIssues.LONG_LINE_WRAP,
				expression.firstToken.fsPath,
				toPosition(expression.firstToken, false),
				{
					edit: [
						TextEdit.replace(
							Range.create(
								toPosition(expression.firstToken.prevToken!),
								toPosition(expression.firstToken, false),
							),
							`\n${createIndentString(level, indentString, widthToPrefix(settings, expectedCol))}`,
						),
					],
					codeActionTitle: `Move ...${expression.toString()}... to a new line`,
				},
				toPosition(expression.lastToken),
			),
		];
	}

	if (!(expression instanceof ComplexExpression)) {
		// we cannot do more this is either a macro call and we should not touch the params or macros or this has no
		// breakable components
		return [];
	}

	const flatJoin = expression.flatJoin;

	for (const [index, exp] of flatJoin.entries()) {
		const wrap = needWrapping(
			exp.expression.firstToken,
			flatJoin?.at(index + 1)?.operator.lastToken ??
				expression.expression.lastToken,
			settings,
			documentText,
		);

		if (wrap === false) {
			continue;
		}

		const expectedCol = options.runExpressionIndentationCheck
			? getExpressionCol(
					propertyValue,
					exp.expression,
					settings,
					documentText,
					level,
					propertyNameWidth + 4,
					!!wrap,
				)
			: propertyNameWidth + 4;

		if (wrap === null) {
			// Value is on multiple lines so we need to go deeper
			return formatLongLinesExpression(
				propertyValue,
				propertyNameWidth,
				exp.expression,
				level,
				settings,
				options,
				documentText,
				indentString,
				index !== 0,
				expressionLevel + 1,
			);
		}

		const otherItem = flatJoin
			.slice(index)
			.find(
				(v) =>
					v.expression.firstToken.pos.line !==
					exp.expression.firstToken.pos.line,
			);

		return [
			genFormattingDiagnostic(
				FormattingIssues.LONG_LINE_WRAP,
				exp.expression.firstToken.fsPath,
				toPosition(exp.expression.firstToken, false),
				{
					edit: [
						TextEdit.replace(
							Range.create(
								toPosition(
									exp.expression.firstToken.prevToken!,
								),
								toPosition(exp.expression.firstToken, false),
							),
							`\n${createIndentString(level, indentString, widthToPrefix(settings, expectedCol))}`,
						),
						...(otherItem // wrap other item up to recursively align using least line possible
							? [
									TextEdit.replace(
										Range.create(
											toPosition(
												otherItem.expression.firstToken
													.prevToken!,
											),
											toPosition(
												otherItem.expression.firstToken,
												false,
											),
										),
										' ',
									),
								]
							: []),
					],
					codeActionTitle: `Move ...${exp.expression.toString()}... to a new line`,
				},
				toPosition(exp.expression.lastToken),
			),
		];
	}

	return;
};
