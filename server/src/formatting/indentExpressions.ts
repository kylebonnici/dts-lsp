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
import { Position, Range, TextEdit } from 'vscode-languageserver';
import { DtcBaseNode } from '../ast/dtc/node';
import { DtcProperty } from '../ast/dtc/property';
import { ASTBase } from '../ast/base';
import { FileDiagnostic, FormattingIssues, Token } from '../types';
import { PropertyValues } from '../ast/dtc/values/values';
import { PropertyValue } from '../ast/dtc/values/value';
import { ArrayValues } from '../ast/dtc/values/arrayValue';
import { ByteStringValue } from '../ast/dtc/values/byteString';
import { applyEdits, genFormattingDiagnostic } from '../helpers';
import {
	ComplexExpression,
	Expression,
} from '../ast/cPreprocessors/expression';
import {
	CMacroCall,
	CMacroCallParam,
} from '../ast/cPreprocessors/functionCall';
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

export async function formatExpressionIndentation(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'File Diagnostics',
	options: FormattingFlags,
): Promise<FileDiagnostic[]>;
export async function formatExpressionIndentation(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'Both',
	options: FormattingFlags,
): Promise<{ text: string; diagnostic: FileDiagnostic[] }>;
export async function formatExpressionIndentation(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'New Text',
	options: FormattingFlags,
): Promise<string>;
export async function formatExpressionIndentation(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics' | 'Both',
	options: FormattingFlags,
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	let newText = text;

	const edits = await baseIndentExpression(
		documentFormattingParams,
		splitDocument,
		astItems,
		uri,
		options,
	);

	const rangeEdits = filterOnOffEdits(
		formatOnOffMeta,
		documentFormattingParams,
		edits,
	);

	newText = applyEdits(
		TextDocument.create(uri, 'devicetree', 0, text),
		rangeEdits.flatMap((i) => i.raw.edit).filter((e) => !!e),
	);

	switch (returnType) {
		case 'New Text':
			return newText;
		case 'File Diagnostics':
			return rangeEdits;
		case 'Both':
			return { text: newText, diagnostic: rangeEdits };
	}
}

async function baseIndentExpression(
	documentFormattingParams: CustomDocumentFormattingParams,
	documentText: string[],
	astItems: ASTBase[],
	uri: string,
	options: FormattingFlags,
): Promise<FileDiagnostic[]> {
	const astItemLevel = getAstItemLevel(astItems, uri);

	const result: FileDiagnostic[] = (
		await Promise.all(
			astItems.flatMap(
				async (base) =>
					await indentExpressionEdits(
						documentFormattingParams,
						documentText,
						base,
						uri,
						astItemLevel,
						options,
					),
			),
		)
	).flat();

	return result;
}

const indentExpressionEdits = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	documentText: string[],
	astNode: ASTBase,
	uri: string,
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
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
		return formatDtcNode(
			documentFormattingParams,
			documentText,
			astNode,
			uri,
			level,
			options,
			computeLevel,
		);
	} else if (astNode instanceof DtcProperty) {
		return formatDtcProperty(
			astNode,
			level,
			settings,
			documentText,
			singleIndent,
		);
	}

	return [];
};

const formatDtcNode = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	documentText: string[],
	node: DtcBaseNode,
	uri: string,
	level: number,
	options: FormattingFlags,
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
): Promise<FileDiagnostic[]> => {
	const result: FileDiagnostic[] = [];

	result.push(
		...(
			await Promise.all(
				node.children.flatMap((c) =>
					indentExpressionEdits(
						documentFormattingParams,
						documentText,
						c,
						uri,
						computeLevel,
						options,
						level + 1,
					),
				),
			)
		).flat(),
	);

	return result;
};

const formatDtcProperty = (
	property: DtcProperty,
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	if (property.firstToken.pos.line === property.lastToken.pos.line) {
		return [];
	}

	if (property.values) {
		return formatPropertyValues(
			property.propertyName?.name.length ?? 0,
			property.values,
			level,
			settings,
			documentText,
			singleIndent,
		);
	}

	return [];
};

const formatPropertyValues = (
	propertyNameWidth: number,
	values: PropertyValues,
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	return values.values.flatMap((v) =>
		v
			? formatPropertyValue(
					propertyNameWidth,
					v,
					level,
					settings,
					documentText,
					singleIndent,
				)
			: [],
	);
};

const formatPropertyValue = (
	propertyNameWidth: number,
	value: PropertyValue,
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	// Value is on multiple lines so we need to go deeper
	const innerValue = value.value;

	if (innerValue instanceof ArrayValues) {
		return (
			formatArrayValue(
				value,
				propertyNameWidth,
				innerValue,
				level,
				settings,
				documentText,
				singleIndent,
			) ?? []
		);
	}

	if (innerValue instanceof CMacroCall) {
		return formatCMacroCallParameters(
			value,
			propertyNameWidth,
			innerValue,
			settings,
			documentText,
			singleIndent,
			level,
		);
	}

	return [];
};

const formatCMacroCallParameters = (
	propertyValue: PropertyValue,
	propertyNameWidth: number,
	macroCall: CMacroCall,
	settings: FormattingSettings,
	documentText: string[],
	indentString: string,
	level: number,
): FileDiagnostic[] => {
	const width = getExpressionCol(
		propertyValue,
		macroCall,
		settings,
		documentText,
		level,
		propertyNameWidth + 4,
	);

	return macroCall.params.flatMap((param) =>
		formatCMacroCallParam(
			param,
			settings,
			documentText,
			indentString,
			level,
			width + macroCall.functionName.name.length + 1,
		),
	);
};

const formatCMacroCallParam = (
	param: CMacroCallParam | null,
	settings: FormattingSettings,
	documentText: string[],
	indentString: string,
	level: number,
	width: number,
): FileDiagnostic[] => {
	if (!param) {
		return [];
	}

	const firstToken =
		param.firstToken.value === '\\'
			? param.firstToken.nextToken
			: param.firstToken;
	if (!firstToken || firstToken.pos.line === firstToken.prevToken?.pos.line) {
		return [];
	}

	const lineText = documentText[firstToken?.pos.line].slice(
		0,
		firstToken.pos.col,
	);

	const indent = createIndentString(
		level,
		indentString,
		widthToPrefix(settings, width),
	);

	if (lineText === indent) {
		return [];
	}

	const start = Position.create(firstToken.pos.line, 0);
	const end = Position.create(firstToken.pos.line, firstToken.pos.col);
	const range = Range.create(start, end);
	const edit = TextEdit.replace(range, indent);

	return [
		genFormattingDiagnostic(
			FormattingIssues.WRONG_INDENTATION,
			param.uri,
			start,
			{
				edit,
				codeActionTitle: 'Fix indentation',
				templateStrings: [
					indent.replaceAll(' ', '·').replaceAll('\t', '→'),
				],
			},
			end,
		),
	];
};

const formatArrayValue = (
	propertyValue: PropertyValue,
	propertyNameWidth: number,
	innerValue: ArrayValues | ByteStringValue,
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	singleIndent: string,
): FileDiagnostic[] => {
	for (const [_, value] of innerValue.values.entries()) {
		const isComplexExpression = value.value instanceof ComplexExpression;

		if (isComplexExpression) {
			const map = new Map<Token, Expression>();
			// const cMacroCallsSet = new Set<CMacroCall>();

			value.value.allDescendants.forEach((c) => {
				if (
					c instanceof Expression &&
					!(c.parentNode instanceof CMacroCall)
				) {
					map.set(c.firstToken, c);
				}
			});

			const expressions = Array.from(map.values());
			// const cMacroCalls = Array.from(cMacroCallsSet.values());

			return expressions.flatMap((exp) =>
				formatExpression(
					propertyValue,
					propertyNameWidth,
					exp,
					settings,
					documentText,
					singleIndent,
					level,
				),
			);
		}

		if (value.value instanceof CMacroCall) {
			return formatCMacroCallParameters(
				propertyValue,
				propertyNameWidth,
				value.value,
				settings,
				documentText,
				singleIndent,
				level,
			);
		}
	}

	return [];
};

const formatExpression = (
	propertyValue: PropertyValue,
	propertyNameWidth: number,
	expression: Expression,
	settings: FormattingSettings,
	documentText: string[],
	indentString: string,
	level: number,
): FileDiagnostic[] => {
	// is first token on line
	if (
		expression.firstToken.pos.line ===
		expression.firstToken.prevToken?.pos.line
	) {
		if (expression instanceof CMacroCall) {
			return formatCMacroCallParameters(
				propertyValue,
				propertyNameWidth,
				expression,
				settings,
				documentText,
				indentString,
				level,
			);
		}
		return [];
	}

	const width = getExpressionCol(
		propertyValue,
		expression,
		settings,
		documentText,
		level,
		propertyNameWidth + 4,
	);
	if (!width) {
		return [];
	}

	const indent = createIndentString(
		level,
		indentString,
		widthToPrefix(settings, width),
	);

	const currentIndent = documentText[expression.firstToken.pos.line].slice(
		0,
		expression.firstToken.pos.col,
	);

	if (currentIndent === indent) {
		if (expression instanceof CMacroCall) {
			return formatCMacroCallParameters(
				propertyValue,
				propertyNameWidth,
				expression,
				settings,
				documentText,
				indentString,
				level,
			);
		}
		return [];
	}

	const start = Position.create(expression.firstToken.pos.line, 0);
	const end = Position.create(
		expression.firstToken.pos.line,
		expression.firstToken.pos.col,
	);
	const range = Range.create(start, end);
	const edit = TextEdit.replace(range, indent);

	return [
		genFormattingDiagnostic(
			FormattingIssues.WRONG_INDENTATION,
			expression.uri,
			start,
			{
				edit,
				codeActionTitle: 'Fix indentation',
				templateStrings: [
					indent.replaceAll(' ', '·').replaceAll('\t', '→'),
				],
			},
			end,
		),
	];
};
