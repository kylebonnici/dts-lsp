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

import {
	Diagnostic,
	DocumentFormattingParams,
	DocumentRangeFormattingParams,
	ErrorCodes,
	Position,
	Range,
	ResponseError,
	TextEdit,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
} from '../ast/dtc/node';
import { DtcProperty } from '../ast/dtc/property';
import { DeleteBase } from '../ast/dtc/delete';
import { ASTBase } from '../ast/base';
import {
	FileDiagnostic,
	FileDiagnosticWithEdit,
	FileDiagnosticWithEdits,
	FormattingIssues,
	Token,
} from '../types';
import { PropertyValues } from '../ast/dtc/values/values';
import { PropertyValue } from '../ast/dtc/values/value';
import { AllValueType } from '../ast/dtc/types';
import { ArrayValues } from '../ast/dtc/values/arrayValue';
import { ByteStringValue } from '../ast/dtc/values/byteString';
import { LabeledValue } from '../ast/dtc/values/labeledValue';
import { Include } from '../ast/cPreprocessors/include';
import {
	applyEdits,
	coreSyntaxIssuesFilter,
	fileURIToFsPath,
	genFormattingDiagnostic,
	isPathEqual,
	rangesOverlap,
	toPosition,
	toRange,
} from '../helpers';
import { Comment, CommentBlock } from '../ast/dtc/comment';
import { LabelAssign } from '../ast/dtc/label';
import {
	ComplexExpression,
	Expression,
} from '../ast/cPreprocessors/expression';
import { CMacroCall } from '../ast/cPreprocessors/functionCall';
import { getPropertyFromChild, isPropertyValueChild } from '../ast/helpers';
import { CIdentifier } from '../ast/cPreprocessors/cIdentifier';
import { Parser } from '../parser';
import { Lexer } from '../lexer';
import {
	CElse,
	CIf,
	CIfBase,
	IfDefineBlock,
	IfElIfBlock,
} from '../ast/cPreprocessors/ifDefine';
import { NumberValue } from '../ast/dtc/values/number';
import {
	CustomDocumentFormattingParams,
	FormattingFlags,
	FormattingSettings,
	LevelMeta,
} from './types';
import {
	createIndentString,
	filterOnOffEdits,
	getAstItemLevel,
	pairFormatOnOff,
	widthToPrefix,
} from './helpers';
import { formatLongLines } from './longLines';
import { formatExpressionIndentation } from './indentExpressions';

const hasLongLines = (text: string, tabSize: number, wordWrapColumn: number) =>
	!!text
		.split('\n')
		.find(
			(l) =>
				l
					.replace(/^\s+/, (prefix) =>
						prefix.replace(/\t/g, ' '.repeat(tabSize)),
					)
					.trimEnd().length > wordWrapColumn,
		);

const getAstItems = async (
	filePath: string,
	startText: string,
	currentText: string,
) => {
	if (startText !== currentText) {
		const parser = new Parser(
			filePath,
			[],
			undefined,
			() => {
				const lexer = new Lexer(currentText, filePath);
				return lexer.tokens;
			},
			true,
		);
		await parser.stable;
		return parser.allAstItems;
	}
};

export async function formatText(
	documentFormattingParams: (
		| DocumentFormattingParams
		| DocumentRangeFormattingParams
	) & { ranges?: Range[] },
	text: string,
	returnType: 'Both',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<{ text: string; diagnostic: FileDiagnostic[] }>;
export async function formatText(
	documentFormattingParams: (
		| DocumentFormattingParams
		| DocumentRangeFormattingParams
	) & { ranges?: Range[] },
	text: string,
	returnType: 'New Text',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<string>;
export async function formatText(
	documentFormattingParams: (
		| DocumentFormattingParams
		| DocumentRangeFormattingParams
	) & { ranges?: Range[] },
	text: string,
	returnType: 'File Diagnostics',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<FileDiagnostic[]>;
export async function formatText(
	documentFormattingParams: (
		| DocumentFormattingParams
		| DocumentRangeFormattingParams
	) & { ranges?: Range[] },
	text: string,
	returnType: 'New Text' | 'File Diagnostics' | 'Both',
	options: FormattingFlags = {
		runBaseCheck: true,
		runLongLineCheck: true,
		runExpressionIndentationCheck: true,
	},
	tokens?: Token[],
	prevIfBlocks: (IfDefineBlock | IfElIfBlock)[] = [],
	processedPrevIfBlocks: CIfBase[] = [],
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const fsPath = fileURIToFsPath(documentFormattingParams.textDocument.uri);
	tokens ??= new Lexer(text, fsPath).tokens;
	const rawTokens = [...tokens];
	let parser = new Parser(fsPath, [], undefined, () => tokens, true);
	await parser.stable;

	const issues = parser.issues.filter((issue) =>
		coreSyntaxIssuesFilter(issue.raw, fsPath, false),
	);

	if (issues?.length) {
		throw new ResponseError<Diagnostic[]>(
			ErrorCodes.InternalError,
			'Unable to format. File has syntax issues.',
			issues.map((i) => i.diagnostic()),
		);
	}

	const wordWrapColumn =
		typeof documentFormattingParams.options.wordWrapColumn === 'number'
			? documentFormattingParams.options.wordWrapColumn
			: 100;

	let variantDocuments = await getDisabledMarcoRangeEdits(
		{
			...documentFormattingParams,
			options: {
				...documentFormattingParams.options,
				wordWrapColumn,
			},
		},
		parser,
		prevIfBlocks,
		processedPrevIfBlocks,
		rawTokens,
		text,
		options,
	);

	if (returnType === 'New Text') {
		let finalText = text;

		if (options.runBaseCheck) {
			const r = await formatAstBaseItems(
				{
					...documentFormattingParams,
					options: {
						...documentFormattingParams.options,
						wordWrapColumn,
					},
				},
				parser.allAstItems,
				parser.includes,
				prevIfBlocks,
				fsPath,
				text,
				returnType,
				options,
				variantDocuments,
			);
			variantDocuments = [];
			finalText = r;
		}

		if (options.runExpressionIndentationCheck) {
			const allAstItems =
				(await getAstItems(fsPath, text, finalText)) ??
				parser.allAstItems;
			finalText = await formatExpressionIndentation(
				{
					...documentFormattingParams,
					options: {
						...documentFormattingParams.options,
						wordWrapColumn,
					},
				},
				allAstItems,
				fsPath,
				finalText,
				returnType,
				options,
			);
		}

		if (
			options.runLongLineCheck &&
			hasLongLines(
				finalText,
				documentFormattingParams.options.tabSize,
				wordWrapColumn,
			)
		) {
			let prevText = '';
			do {
				prevText = finalText;
				const allAstItems =
					(await getAstItems(fsPath, text, prevText)) ??
					parser.allAstItems;

				finalText = await formatLongLines(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					allAstItems,
					fsPath,
					prevText,
					'New Text',
					options,
					[...variantDocuments],
				);
			} while (prevText !== finalText);
		}

		return finalText;
	}

	if (returnType === 'Both') {
		let finalText = text;
		let diagnostic: FileDiagnostic[] = [];
		if (options.runBaseCheck) {
			const r = await formatAstBaseItems(
				{
					...documentFormattingParams,
					options: {
						...documentFormattingParams.options,
						wordWrapColumn,
					},
				},
				parser.allAstItems,
				parser.includes,
				prevIfBlocks,
				fsPath,
				text,
				returnType,
				options,
				[...variantDocuments],
			);
			finalText = r.text;
			diagnostic.push(...r.diagnostic);
		}

		if (options.runExpressionIndentationCheck) {
			diagnostic.push(
				...(await formatExpressionIndentation(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					parser.allAstItems,
					fsPath,
					finalText,
					'File Diagnostics',
					options,
				)),
			);

			const allAstItems =
				(await getAstItems(fsPath, text, finalText)) ??
				parser.allAstItems;
			const r = await formatExpressionIndentation(
				{
					...documentFormattingParams,
					options: {
						...documentFormattingParams.options,
						wordWrapColumn,
					},
				},
				allAstItems,
				fsPath,
				finalText,
				returnType,
				options,
			);
			finalText = r.text;
		}

		if (
			options.runLongLineCheck &&
			hasLongLines(
				finalText,
				documentFormattingParams.options.tabSize,
				wordWrapColumn,
			)
		) {
			diagnostic.push(
				...(await formatLongLines(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					parser.allAstItems,
					fsPath,
					text,
					'File Diagnostics',
					options,
					[...variantDocuments],
				)),
			);

			let prevText = '';
			do {
				prevText = finalText;
				let allAstItems =
					(await getAstItems(fsPath, text, prevText)) ??
					parser.allAstItems;

				finalText = await formatLongLines(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					allAstItems,
					fsPath,
					prevText,
					'New Text',
					options,
					[...variantDocuments],
				);
			} while (prevText !== finalText);
		}

		return {
			text: finalText,
			diagnostic,
		};
	}

	let diagnostic: FileDiagnostic[] = [];
	if (options.runBaseCheck) {
		const r = await formatAstBaseItems(
			{
				...documentFormattingParams,
				options: {
					...documentFormattingParams.options,
					wordWrapColumn,
				},
			},
			parser.allAstItems,
			parser.includes,
			prevIfBlocks,
			fsPath,
			text,
			returnType,
			options,
			[...variantDocuments],
		);
		diagnostic.push(...r);
	}

	if (options.runExpressionIndentationCheck) {
		const r = await formatExpressionIndentation(
			{
				...documentFormattingParams,
				options: {
					...documentFormattingParams.options,
					wordWrapColumn,
				},
			},
			parser.allAstItems,
			fsPath,
			text,
			returnType,
			options,
		);
		diagnostic.push(...r);
	}

	if (
		options.runLongLineCheck &&
		hasLongLines(
			text,
			documentFormattingParams.options.tabSize,
			wordWrapColumn,
		)
	) {
		diagnostic.push(
			...(await formatLongLines(
				{
					...documentFormattingParams,
					options: {
						...documentFormattingParams.options,
						wordWrapColumn,
					},
				},
				parser.allAstItems,
				fsPath,
				text,
				returnType,
				options,
				[...variantDocuments],
			)),
		);
	}

	return diagnostic;
}

const getDisabledMarcoRangeEdits = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	parser: Parser,
	prevIfBlocks: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks: CIfBase[],
	rawTokens: Token[],
	text: string,
	options: FormattingFlags,
) => {
	const ifDefBlocks = parser.cPreprocessorParser.allAstItems.filter(
		(ast) => ast instanceof IfDefineBlock,
	);
	const ifBlocks = parser.cPreprocessorParser.allAstItems.filter(
		(ast) => ast instanceof IfElIfBlock,
	);

	const newIfDefBlocks = ifDefBlocks.filter((b) =>
		prevIfBlocks.every(
			(bb) => b.firstToken.pos.line !== bb.firstToken.pos.line,
		),
	);
	const newIfBlocks = ifBlocks.filter((b) =>
		prevIfBlocks.every(
			(bb) => b.firstToken.pos.line !== bb.firstToken.pos.line,
		),
	);
	prevIfBlocks.push(...newIfDefBlocks);
	prevIfBlocks.push(...newIfBlocks);

	const rangesToWorkOn = [
		...ifDefBlocks.map((block) => {
			if (block.ifDef.active) {
				if (block.elseOption) {
					return {
						block,
						branch: block.elseOption,
					};
				}
				return;
			}

			return {
				block,
				branch: block.ifDef,
			};
		}),
		...ifBlocks.flatMap((block) => {
			const active = block.ifBlocks.find((i) => i.active);
			const results: {
				block: IfElIfBlock;
				branch: CIf | CElse;
			}[] = block.ifBlocks
				.filter((v) => !v.active)
				.map((branch) => ({
					block,
					branch,
				}));
			if (!active && block.elseOption) {
				results.push({
					block,
					branch: block.elseOption,
				});
			}

			return results;
		}),
	].filter((v) => !!v);

	const action = (
		meta:
			| {
					block: IfDefineBlock;
					branch: CElse;
			  }
			| {
					block: IfElIfBlock;
					branch: CIf | CElse;
			  },
	) => {
		const rangeToClean = meta.block.getInValidTokenRangeWhenActiveBlock(
			meta.branch,
		);

		const newTokenStream = rawTokens.filter((t) => !rangeToClean.has(t));
		const range = meta.block.range;
		processedPrevIfBlocks.push(meta.branch);
		return formatText(
			{ ...documentFormattingParams, range },
			text,
			'File Diagnostics',
			options,
			newTokenStream,
			prevIfBlocks,
			processedPrevIfBlocks,
		);
	};

	const results: FileDiagnostic[] = [];
	await rangesToWorkOn
		.filter((r) =>
			processedPrevIfBlocks.every(
				(i) => i.firstToken.pos.line !== r.block.firstToken.pos.line,
			),
		)
		.reduce((acc, curr) => {
			return acc.then(async () => {
				results.push(...(await action(curr)));
			});
		}, Promise.resolve());
	return results;
};

async function formatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	text: string,
	returnType: 'Both',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<{ text: string; diagnostic: FileDiagnostic[] }>;
async function formatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	text: string,
	returnType: 'File Diagnostics',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<FileDiagnostic[]>;
async function formatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	text: string,
	returnType: 'New Text',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<string>;
async function formatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics' | 'Both',
	options: FormattingFlags,
	edits: FileDiagnostic[] = [],
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	let newText = text;

	edits.push(
		...(await baseFormatAstBaseItems(
			documentFormattingParams,
			astItems,
			includes,
			ifDefBlocks,
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
		case 'Both':
			return {
				text: newText,
				diagnostic: rangeEdits,
			};
	}
}

async function baseFormatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	splitDocument: string[],
	options: FormattingFlags,
): Promise<FileDiagnostic[]> {
	const astItemLevel = getAstItemLevel(astItems, fsPath);

	const result: FileDiagnostic[] = (
		await Promise.all(
			astItems.flatMap(
				async (base) =>
					await getTextEdit(
						documentFormattingParams,
						base,
						fsPath,
						astItemLevel,
						splitDocument,
						includes,
						ifDefBlocks,
						options,
					),
			),
		)
	).flat();

	if (
		documentFormattingParams.options.insertFinalNewline &&
		splitDocument.at(-1)?.trim() !== ''
	) {
		const edit = TextEdit.insert(
			Position.create(
				splitDocument.length,
				splitDocument[splitDocument.length - 1].length,
			),
			'\n',
		);
		result.push(
			genFormattingDiagnostic(
				FormattingIssues.MISSING_EOF_NEW_LINE,
				fsPath,
				Position.create(splitDocument.length, 0),
				{ edit, codeActionTitle: 'Insert new line' },
			),
		);
	}

	if (documentFormattingParams.options.trimFinalNewlines) {
		let noOfTrailingNewLines = 0;

		while (splitDocument.at(-(1 + noOfTrailingNewLines))?.trim() === '') {
			noOfTrailingNewLines++;
		}

		if (noOfTrailingNewLines > 1) {
			const lineNumber = splitDocument.length - 1;
			const edit = TextEdit.del(
				Range.create(
					Position.create(
						splitDocument.length - noOfTrailingNewLines,
						0,
					),
					Position.create(lineNumber, 0),
				),
			);
			result.push(
				genFormattingDiagnostic(
					FormattingIssues.TRIALING_EOF_NEW_LINES,
					fsPath,
					Position.create(lineNumber, 0),
					{ edit, codeActionTitle: 'Remove trailing EOF lines' },
				),
			);
		}
	}

	const allEdits = result.flatMap((i) => i.raw.edit).filter((i) => !!i);

	if (documentFormattingParams.options.trimTrailingWhitespace) {
		const issues = removeTrailingWhitespace(
			splitDocument,
			allEdits,
			fsPath,
		);
		result.push(...issues);
	}

	return result;
}

const removeTrailingWhitespace = (
	documentText: string[],
	textEdits: TextEdit[],
	fsPath: string,
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];
	documentText.forEach((line, i) => {
		const removeReturn = line.endsWith('\r') ? line.slice(0, -1) : line;
		const endTrimmed = removeReturn.trimEnd();
		if (endTrimmed.length !== removeReturn.length) {
			const rangeToCover = Range.create(
				Position.create(i, endTrimmed.length),
				Position.create(i, removeReturn.length),
			);
			if (
				!textEdits.some((edit) =>
					rangesOverlap(rangeToCover, edit.range),
				)
			)
				result.push(
					genFormattingDiagnostic(
						FormattingIssues.TRIALING_WHITE_SPACE,
						fsPath,
						rangeToCover.start,
						{
							edit: TextEdit.del(rangeToCover),
							codeActionTitle: 'Remove whitespace',
						},
						rangeToCover.end,
					),
				);
		}
	});
	return result;
};

const removeNewLinesBetweenTokenAndPrev = (
	token: Token,
	expectedNewLines = 1,
	forceExpectedNewLines = false,
	prevToken = token.prevToken,
): FileDiagnosticWithEdit | undefined => {
	if (prevToken) {
		const diffNumberOfLines = token.pos.line - prevToken.pos.line;
		const linesToRemove = diffNumberOfLines - expectedNewLines;

		if (
			linesToRemove &&
			((diffNumberOfLines !== 2 && expectedNewLines !== 0) ||
				expectedNewLines === 0 ||
				forceExpectedNewLines)
		) {
			const start = Position.create(
				prevToken.pos.line,
				prevToken.pos.colEnd,
			);
			const end = Position.create(
				token.pos.line,
				expectedNewLines ? 0 : token.pos.col,
			);
			const edit = TextEdit.replace(
				Range.create(start, end),
				'\n'.repeat(expectedNewLines),
			);
			return genFormattingDiagnostic(
				FormattingIssues.INCORRECT_WHITE_SPACE,
				token.fsPath,
				start,
				{
					edit,
					codeActionTitle:
						linesToRemove < 0
							? 'Insert new lines'
							: 'Remove unnecessary new lines',
					templateStrings: [expectedNewLines.toString()],
				},
				end,
			);
		}
	} else if (token.pos.line) {
		const start = Position.create(0, 0);
		const end = Position.create(token.pos.line, 0);
		const edit = TextEdit.del(Range.create(start, end));
		return genFormattingDiagnostic(
			FormattingIssues.INCORRECT_WHITE_SPACE,
			token.fsPath,
			start,
			{
				edit,
				codeActionTitle: 'Remove unnecessary new lines',
				templateStrings: ['0'],
			},
			end,
		);
	}
};

const pushItemToNewLineAndIndent = (
	token: Token,
	level: number,
	indentString: string,
	prefix: string = '',
	numberOfNewLines = 1,
): FileDiagnostic | undefined => {
	const newLine = token.pos.line === token.prevToken?.pos.line;

	if (token.prevToken && newLine) {
		const start = Position.create(
			token.prevToken.pos.line,
			token.prevToken.pos.colEnd,
		);
		const end = Position.create(token.pos.line, token.pos.col);
		const edit = TextEdit.replace(
			Range.create(start, end),
			`${'\n'.repeat(numberOfNewLines)}${''.padStart(level * indentString.length, indentString)}${prefix}`,
		);
		return genFormattingDiagnostic(
			FormattingIssues.MISSING_NEW_LINE,
			token.fsPath,
			start,
			{ edit, codeActionTitle: 'Move to new line' },
			end,
		);
	}
};

const createIndentEdit = (
	token: Token,
	level: number,
	indentString: string,
	documentText: string[],
	prefix: string = '',
): FileDiagnostic[] => {
	const indent = createIndentString(level, indentString, prefix);
	const start = Position.create(token.pos.line, 0);
	const end = Position.create(token.pos.line, token.pos.col);
	const range = Range.create(start, end);

	const currentText = getTextFromRange(documentText, range);
	if (indent === currentText) return [];

	const edit = TextEdit.replace(range, indent);

	return [
		genFormattingDiagnostic(
			FormattingIssues.WRONG_INDENTATION,
			token.fsPath,
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

const fixedNumberOfSpaceBetweenTokensAndNext = (
	token: Token,
	documentText: string[],
	expectedSpaces = 1,
	keepNewLines = false,
): FileDiagnosticWithEdits[] => {
	if (!token.nextToken) return [];

	if (token.nextToken?.pos.line !== token.pos.line) {
		if (keepNewLines) {
			return [];
		}
		const removeNewLinesEdit = removeNewLinesBetweenTokenAndPrev(
			token.nextToken,
			0,
		);
		if (!removeNewLinesEdit) {
			throw new Error('remove new LinesEdit must be defined');
		}
		if (expectedSpaces) {
			removeNewLinesEdit.raw.edit.newText = `${' '.repeat(expectedSpaces)}${
				removeNewLinesEdit.raw.edit.newText
			}`;
		}
		return [removeNewLinesEdit];
	}

	// from this point we must be on the same line

	if (expectedSpaces === 0) {
		if (token.nextToken.pos.col === token.pos.colEnd) return [];

		const start = Position.create(token.pos.line, token.pos.colEnd);
		const end = Position.create(
			token.nextToken.pos.line,
			token.nextToken.pos.col,
		);
		const edit = TextEdit.del(Range.create(start, end));
		return [
			genFormattingDiagnostic(
				FormattingIssues.INCORRECT_WHITE_SPACE,
				token.fsPath,
				start,
				{
					edit,
					codeActionTitle: 'Remove space(s)',
					templateStrings: ['0'],
				},
				end,
			),
		];
	}

	if (token.pos.colEnd === token.nextToken.pos.col) {
		const start = Position.create(
			token.nextToken.pos.line,
			token.nextToken.pos.col,
		);
		const edit = TextEdit.insert(start, ' '.repeat(expectedSpaces));
		return [
			genFormattingDiagnostic(
				FormattingIssues.INCORRECT_WHITE_SPACE,
				token.fsPath,
				start,
				{
					edit,
					codeActionTitle: 'Insert Space(s)',
					templateStrings: [expectedSpaces.toString()],
				},
			),
		];
	}

	const delta = token.nextToken.pos.col - token.pos.colEnd;

	if (
		delta === expectedSpaces &&
		documentText[token.pos.line].slice(
			token.pos.colEnd,
			token.nextToken.pos.col,
		) === ' '.repeat(expectedSpaces)
	)
		return [];

	const start = Position.create(token.pos.line, token.pos.colEnd);
	const end = Position.create(
		token.nextToken.pos.line,
		token.nextToken.pos.col,
	);
	const edit = TextEdit.replace(
		Range.create(start, end),
		' '.repeat(expectedSpaces),
	);

	return [
		genFormattingDiagnostic(
			FormattingIssues.INCORRECT_WHITE_SPACE,
			token.fsPath,
			start,
			{
				edit,
				codeActionTitle:
					delta > expectedSpaces
						? 'Remove space(s)'
						: 'Insert space(s)',
				templateStrings: [expectedSpaces.toString()],
			},
			end,
		),
	];
};

const formatLabels = (
	labels: LabelAssign[],
	documentText: string[],
	level: number,
	indentString: string,
	sameLine: boolean,
): FileDiagnostic[] => {
	return labels.slice(1).flatMap((label) => {
		if (
			(sameLine && label.firstToken.prevToken) ||
			label.firstToken.pos.line === label.firstToken.prevToken?.pos.line
		) {
			return fixedNumberOfSpaceBetweenTokensAndNext(
				label.firstToken.prevToken,
				documentText,
			);
		}
		return ensureOnNewLineAndMax1EmptyLineToPrev(
			label.firstToken,
			level,
			indentString,
			documentText,
			undefined,
			1,
			true,
		);
	});
};

const formatDtcNode = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	node: DtcBaseNode,
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	fsPath: string,
	level: number,
	indentString: string,
	options: FormattingFlags,
	documentText: string[],
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
): Promise<FileDiagnostic[]> => {
	const result: FileDiagnostic[] = [];

	const expectedNumberOfLines =
		node.topComment ||
		(node.firstToken.prevToken?.value === '{' && !node.topComment)
			? 1
			: getNodeExpectedNumberOfNewLines(node.firstToken, ifDefBlocks);

	result.push(
		...ensureOnNewLineAndMax1EmptyLineToPrev(
			node.firstToken,
			level,
			indentString,
			documentText,
			undefined,
			expectedNumberOfLines,
			true,
		),
	);

	if (node instanceof DtcChildNode || node instanceof DtcRefNode) {
		result.push(
			...formatLabels(
				node.labels,
				documentText,
				level,
				indentString,
				false,
			),
		);

		if (node instanceof DtcChildNode) {
			if (
				node.name?.address?.length &&
				node.name.address.every((a) => a.toString() !== '')
			) {
				node.name.address.forEach((address) => {
					const rawAddressString = documentText[
						address.firstToken.pos.line
					].slice(
						address.firstToken.pos.col,
						address.lastToken.pos.colEnd,
					);

					const lowerCaseAddr = rawAddressString.toLowerCase();
					const justTheAddress = lowerCaseAddr
						.match(/^(?:0x)?([0-9a-f]+)(?:ull)?$/i)
						?.at(1);

					const issuesTypes: FormattingIssues[] = [];
					if (lowerCaseAddr.startsWith('0x')) {
						issuesTypes.push(FormattingIssues.NODE_NAME_IS_HEX);
					}

					if (lowerCaseAddr.endsWith('ull')) {
						issuesTypes.push(FormattingIssues.NODE_NAME_NO_ULL);
					}

					if (justTheAddress !== rawAddressString) {
						issuesTypes.push(FormattingIssues.HEX_TO_LOWER_CASE);
					}

					if (justTheAddress && issuesTypes.length) {
						result.push(
							genFormattingDiagnostic(
								issuesTypes,
								address.fsPath,
								toPosition(address.firstToken, false),
								{
									edit: TextEdit.replace(
										toRange(address),
										justTheAddress,
									),
									codeActionTitle: `Change to '${justTheAddress}'`,
								},
								toPosition(address.lastToken),
							),
						);
					}
				});
			}
			if (node.labels.length && node.name) {
				if (
					node.name.firstToken.pos.line !==
					node.name.firstToken.prevToken?.pos.line
				) {
					result.push(
						...ensureOnNewLineAndMax1EmptyLineToPrev(
							node.name.firstToken,
							level,
							indentString,
							documentText,
							undefined,
							1,
							true,
						),
					);
				} else {
					result.push(
						...fixedNumberOfSpaceBetweenTokensAndNext(
							node.name.firstToken.prevToken,
							documentText,
						),
					);
				}
			}
			const nodeNameAndOpenCurlySpacing =
				node.name && node.openScope
					? fixedNumberOfSpaceBetweenTokensAndNext(
							node.name.lastToken,
							documentText,
						)
					: [];
			result.push(...nodeNameAndOpenCurlySpacing);
		} else {
			if (node.labels.length && node.reference?.firstToken.prevToken) {
				result.push(
					...fixedNumberOfSpaceBetweenTokensAndNext(
						node.reference.firstToken.prevToken,
						documentText,
					),
				);
			}
			const nodeNameAndOpenCurlySpacing =
				node.reference && node.openScope
					? fixedNumberOfSpaceBetweenTokensAndNext(
							node.reference.lastToken,
							documentText,
						)
					: [];
			result.push(...nodeNameAndOpenCurlySpacing);
		}
	} else if (
		node instanceof DtcRootNode &&
		node.firstToken.value === '/' &&
		node.openScope
	) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				node.firstToken,
				documentText,
				1,
			),
		);
	}

	result.push(
		...(
			await Promise.all(
				node.children.flatMap((c) =>
					getTextEdit(
						documentFormattingParams,
						c,
						fsPath,
						computeLevel,
						documentText,
						includes,
						ifDefBlocks,
						options,
						level + 1,
					),
				),
			)
		).flat(),
	);

	if (node.closeScope) {
		if (node.openScope && node.closeScope.prevToken === node.openScope) {
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					node.openScope,
					documentText,
					0,
				),
			);
		} else {
			result.push(
				...ensureOnNewLineAndMax1EmptyLineToPrev(
					node.closeScope,
					level,
					indentString,
					documentText,
					undefined,
					1,
					true,
				),
			);
		}
	}

	if (node.lastToken.value === ';' && node.closeScope) {
		result.push(...moveNextTo(node.closeScope, node.lastToken));
	}

	return result;
};

const formatLabeledValue = <T extends ASTBase>(
	propertyNameWidth: number,
	value: LabeledValue<T>,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	openBracket: Token | undefined,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(
		...formatLabels(
			value.labels,
			documentText,
			level,
			settings.singleIndent,
			true,
		),
	);

	if (value.labels.length && value.value?.firstToken.prevToken) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				value.value.firstToken.prevToken,
				documentText,
			),
		);
	}

	if (value.value instanceof NumberValue) {
		const rawAddressString = documentText[
			value.value.firstToken.pos.line
		].slice(
			value.value.firstToken.pos.col,
			value.value.lastToken.pos.colEnd,
		);

		const lowerCaseAddr = rawAddressString.toLowerCase();
		if (lowerCaseAddr !== rawAddressString) {
			result.push(
				genFormattingDiagnostic(
					FormattingIssues.HEX_TO_LOWER_CASE,
					value.value.fsPath,
					toPosition(value.value.firstToken, false),
					{
						edit: TextEdit.replace(
							toRange(value.value),
							lowerCaseAddr,
						),
						codeActionTitle: `Change to '${lowerCaseAddr}'`,
					},
					toPosition(value.value.lastToken),
				),
			);
		}
	}

	if (value.firstToken.prevToken) {
		if (
			value.firstToken.pos.line !==
				value.firstToken.prevToken?.pos.line &&
			value.firstToken.prevToken !== openBracket
		) {
			const edit = removeNewLinesBetweenTokenAndPrev(
				value.firstToken,
				1,
				true,
			);
			if (edit) result.push(edit);
			result.push(
				...createIndentEdit(
					value.firstToken,
					level,
					settings.singleIndent,
					documentText,
					widthToPrefix(settings, propertyNameWidth + 4), // +4 ' = <'
				),
			);
		} else {
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					value.firstToken.prevToken,
					documentText,
					openBracket && value.firstToken.prevToken === openBracket
						? 0
						: 1,
				),
			);
		}
	}

	if (value.value instanceof Expression) {
		result.push(
			...formatExpression(
				value.value,
				documentText,
				level,
				settings,
				options,
				propertyNameWidth + 4,
			),
		);
	}

	return result;
};

const formatValue = (
	propertyNameWidth: number,
	value: AllValueType,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	if (value instanceof ArrayValues || value instanceof ByteStringValue) {
		if (
			value.openBracket &&
			value.openBracket?.nextToken === value.closeBracket
		) {
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					value.openBracket,
					documentText,
					0,
				),
			);
		} else {
			result.push(
				...value.values.flatMap((v) =>
					formatLabeledValue(
						propertyNameWidth,
						v,
						level,
						settings,
						options,
						value.openBracket,
						documentText,
					),
				),
			);

			if (value.closeBracket?.prevToken) {
				if (
					value.values.at(-1)?.lastToken ===
						value.closeBracket?.prevToken ||
					(value.closeBracket?.prevToken.value === '/' &&
						value.closeBracket?.prevToken?.prevToken?.value === '*')
				) {
					result.push(
						...fixedNumberOfSpaceBetweenTokensAndNext(
							value.closeBracket.prevToken,
							documentText,
							0,
						),
					);
				} else {
					result.push(
						...ensureOnNewLineAndMax1EmptyLineToPrev(
							value.closeBracket,
							level,
							settings.singleIndent,
							documentText,
						),
					);
				}
			}
		}
	} else if (value instanceof Expression) {
		result.push(
			...formatExpression(
				value,
				documentText,
				level,
				settings,
				options,
				propertyNameWidth,
			),
		);
	}

	return result;
};

const formatExpression = (
	value: Expression,
	documentText: string[],
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	width: number,
): FileDiagnostic[] => {
	if (value instanceof CMacroCall) {
		return formatCMacroCall(value, documentText);
	}

	if (value instanceof ComplexExpression) {
		return formatComplexExpression(
			value,
			documentText,
			level,
			settings,
			options,
			width,
		);
	}

	return [];
};

const formatCMacroCall = (
	value: CMacroCall,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(
		...fixedNumberOfSpaceBetweenTokensAndNext(
			value.functionName.lastToken,
			documentText,
			0,
		),
	);

	if (value.lastToken.value === ')' && value.lastToken.prevToken) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				value.lastToken.prevToken,
				documentText,
				0,
			),
		);
	}

	return result;
};

const formatComplexExpression = (
	value: ComplexExpression,
	documentText: string[],
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	width: number,
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	if (value.openBracket && value.openBracket.nextToken) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				value.openBracket,
				documentText,
				0,
			),
		);
	}

	result.push(
		...formatExpression(
			value.expression,
			documentText,
			level,
			settings,
			options,
			width,
		),
	);

	value.join?.forEach((join) => {
		if (join.operator.firstToken.prevToken) {
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					join.operator.firstToken.prevToken,
					documentText,
				),
			);
		}
		if (
			join.expression.firstToken.prevToken?.pos.line ===
			join.expression.firstToken.pos.line
		) {
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					join.expression.firstToken.prevToken,
					documentText,
				),
			);
		} else {
			result.push(
				...ensureOnNewLineAndMax1EmptyLineToPrev(
					join.expression.firstToken,
					level,
					settings.singleIndent,
					documentText,
					widthToPrefix(settings, width),
					undefined,
					undefined,
					!options.runExpressionIndentationCheck,
				),
			);
		}
		result.push(
			...formatExpression(
				join.expression,
				documentText,
				level,
				settings,
				options,
				width,
			),
		);
	});

	if (
		!value.join?.length &&
		!(value.expression instanceof ComplexExpression) &&
		(value.expression instanceof CMacroCall ||
			value.expression instanceof CIdentifier)
	) {
		const edits: TextEdit[] = [];

		if (value.openBracket) {
			const start = Position.create(
				value.openBracket.pos.line,
				value.openBracket.pos.col,
			);
			const end = Position.create(
				value.openBracket.pos.line,
				value.openBracket.pos.colEnd,
			);
			edits.push(TextEdit.del(Range.create(start, end)));
		}

		if (value.closeBracket) {
			const start = Position.create(
				value.closeBracket.pos.line,
				value.closeBracket.pos.col,
			);
			const end = Position.create(
				value.closeBracket.pos.line,
				value.closeBracket.pos.colEnd,
			);
			edits.push(TextEdit.del(Range.create(start, end)));
		}

		result.push(
			genFormattingDiagnostic(
				FormattingIssues.REMOVE_EXPRESSION_BRACKETS,
				value.fsPath,
				edits[0].range.start,
				{ edit: edits, codeActionTitle: 'Remove (...)' },
				edits[edits.length - 1].range.end,
			),
		);
	}

	if (value.closeBracket && value.closeBracket.prevToken) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				value.closeBracket.prevToken,
				documentText,
				0,
			),
		);
	}

	return result;
};

const formatPropertyValue = (
	propertyNameWidth: number,
	value: PropertyValue,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(
		...formatLabels(
			value.startLabels,
			documentText,
			level,
			settings.singleIndent,
			true,
		),
	);

	result.push(
		...formatValue(
			propertyNameWidth,
			value.value,
			level,
			settings,
			options,
			documentText,
		),
	);

	result.push(
		...formatLabels(
			value.endLabels,
			documentText,
			level,
			settings.singleIndent,
			true,
		),
	);

	return result;
};

const formatPropertyValues = (
	propertyNameWidth: number,
	values: PropertyValues,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
	assignOperator: Token | undefined,
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	values.values.forEach((value, i) => {
		if (!value) return [];

		// ensure sameline or newline between  `< 10...` and what is before it
		const prevToken = value.firstToken.prevToken;
		const prevValue = i ? values.values.at(i - 1) : undefined;
		if (prevToken) {
			if (prevToken.pos.line === value.firstToken.pos.line) {
				if (
					prevToken.value === ',' &&
					prevValue?.lastToken.pos.line !==
						value.firstToken.pos.line &&
					prevToken.prevToken?.pos.line !== value.firstToken.pos.line
				) {
					const editToMoveToNewLine = pushItemToNewLineAndIndent(
						value.firstToken,
						level,
						settings.singleIndent,
						widthToPrefix(settings, propertyNameWidth + 3), // +3 ' = '
					);

					if (editToMoveToNewLine) {
						result.push(editToMoveToNewLine);
					}
				} else {
					result.push(
						...fixedNumberOfSpaceBetweenTokensAndNext(
							prevToken,
							documentText,
							1,
						),
					);
				}
			} else {
				if (
					assignOperator &&
					value.firstToken.prevToken === assignOperator
				) {
					result.push(
						...fixedNumberOfSpaceBetweenTokensAndNext(
							assignOperator,
							documentText,
						),
					);
				} else {
					const edit = removeNewLinesBetweenTokenAndPrev(
						value.firstToken,
						1,
						true,
					);
					if (edit) result.push(edit);
					result.push(
						...createIndentEdit(
							value.firstToken,
							level,
							settings.singleIndent,
							documentText,
							widthToPrefix(settings, propertyNameWidth + 3), // +3 ' = '
						),
					);
				}
			}
		}

		result.push(
			...formatPropertyValue(
				propertyNameWidth,
				value,
				level,
				settings,
				options,
				documentText,
			),
		);

		if (value.nextValueSeparator) {
			result.push(
				...moveNextTo(value.lastToken, value.nextValueSeparator),
			);
		}
	});

	return result;
};

const formatDtcProperty = (
	property: DtcProperty,
	level: number,
	settings: FormattingSettings,
	options: FormattingFlags,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	const { force, newLines } = getPropertyExpectedNumberOfNewLines(
		property,
		property.firstToken,
	);

	result.push(
		...ensureOnNewLineAndMax1EmptyLineToPrev(
			property.firstToken,
			level,
			settings.singleIndent,
			documentText,
			undefined,
			newLines,
			force,
		),
	);

	result.push(
		...formatLabels(
			property.labels,
			documentText,
			level,
			settings.singleIndent,
			true,
		),
	);

	if (property.labels.length && property.propertyName?.firstToken.prevToken) {
		result.push(
			...fixedNumberOfSpaceBetweenTokensAndNext(
				property.propertyName.firstToken.prevToken,
				documentText,
			),
		);
	}

	if (property.values) {
		if (property.propertyName) {
			// space before =
			result.push(
				...fixedNumberOfSpaceBetweenTokensAndNext(
					property.propertyName?.lastToken,
					documentText,
				),
			);
		}
		result.push(
			...formatPropertyValues(
				property.propertyName?.name.length ?? 0,
				property.values,
				level,
				settings,
				options,
				documentText,
				property.assignOperatorToken,
			),
		);
	}

	if (property.lastToken.value === ';') {
		result.push(
			...moveNextTo(
				property.children[property.children.length - 1].lastToken,
				property.lastToken,
			),
		);
	}

	return result;
};

const ensureOnNewLineAndMax1EmptyLineToPrev = (
	token: Token,
	level: number,
	indentString: string,
	documentText: string[],
	prefix?: string,
	expectedNewLines?: number,
	forceExpectedNewLines?: boolean,
	indent = true,
) => {
	const result: FileDiagnostic[] = [];

	const editToMoveToNewLine = pushItemToNewLineAndIndent(
		token,
		level,
		indentString,
		prefix,
		expectedNewLines,
	);

	if (editToMoveToNewLine) {
		result.push(editToMoveToNewLine);
	} else {
		const edit = removeNewLinesBetweenTokenAndPrev(
			token,
			expectedNewLines,
			forceExpectedNewLines,
		);
		if (edit) result.push(edit);

		if (indent) {
			result.push(
				...createIndentEdit(
					token,
					level,
					indentString,
					documentText,
					prefix,
				),
			);
		}
	}

	return result;
};

const moveNextTo = (token: Token, toMove: Token): FileDiagnostic[] => {
	if (
		token.pos.line === toMove.pos.line &&
		token.pos.colEnd + 1 === toMove.pos.colEnd
	) {
		return [];
	}

	if (token.nextToken === toMove) {
		const start = Position.create(token.pos.line, token.pos.colEnd);
		const end = Position.create(toMove.pos.line, toMove.pos.col);

		const edit = TextEdit.del(Range.create(start, end));
		return [
			genFormattingDiagnostic(
				FormattingIssues.INCORRECT_WHITE_SPACE,
				token.fsPath,
				start,
				{
					edit,
					codeActionTitle: 'Remove white space',
					templateStrings: ['0'],
				},
				end,
			),
		];
	}

	const start = Position.create(token.pos.line, token.pos.colEnd);
	const end = Position.create(toMove.pos.line, toMove.pos.colEnd);
	const edits = [
		TextEdit.insert(start, toMove.value),
		TextEdit.del(
			Range.create(
				Position.create(
					toMove.prevToken?.pos.line ?? toMove.pos.line,
					toMove.prevToken?.pos.colEnd ?? toMove.pos.col,
				),
				end,
			),
		),
	];
	return [
		genFormattingDiagnostic(
			FormattingIssues.MOVE_NEXT_TO,
			token.fsPath,
			start,
			{
				edit: edits,
				codeActionTitle: 'Move token',
				templateStrings: [toMove.value],
			},
			end,
		),
	];
};

const formatDtcDelete = (
	deleteItem: DeleteBase,
	level: number,
	indentString: string,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(
		...ensureOnNewLineAndMax1EmptyLineToPrev(
			deleteItem.firstToken,
			level,
			indentString,
			documentText,
		),
	);

	const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
		deleteItem.keyword.lastToken,
		documentText,
	);
	result.push(...keywordAndItemSpacing);

	if (deleteItem.lastToken.value === ';') {
		result.push(
			...moveNextTo(
				deleteItem.children[deleteItem.children.length - 1].lastToken,
				deleteItem.lastToken,
			),
		);
	}

	return result;
};

const formatDtcInclude = (
	includeItem: Include,
	fsPath: string,
	levelMeta: LevelMeta | undefined,
	indentString: string,
	documentText: string[],
): FileDiagnostic[] => {
	// we should not format this case
	if (levelMeta === undefined) return [];

	if (!isPathEqual(includeItem.fsPath, fsPath)) return []; // may be coming from some other include  hence ignore

	const result: FileDiagnostic[] = [];

	result.push(
		...ensureOnNewLineAndMax1EmptyLineToPrev(
			includeItem.firstToken,
			levelMeta.level,
			indentString,
			documentText,
		),
	);

	const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
		includeItem.keyword.lastToken,
		documentText,
	);
	result.push(...keywordAndItemSpacing);

	return result;
};

const formatCommentBlock = (
	commentItem: CommentBlock,
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	levelMeta: LevelMeta | undefined,
	indentString: string,
	documentText: string[],
	settings: FormattingSettings,
): FileDiagnostic[] => {
	if (
		commentItem.comments.length === 1 &&
		commentItem.firstToken.pos.line ===
			commentItem.firstToken.prevToken?.pos.line
	) {
		return [];
	}

	return commentItem.comments.flatMap((c, i) =>
		formatBlockCommentLine(
			c,
			commentItem,
			ifDefBlocks,
			levelMeta,
			indentString,
			documentText,
			i
				? i === commentItem.comments.length - 1
					? 'last'
					: 'comment'
				: 'first',
			settings,
		),
	);
};

const getPropertyIndentPrefix = (
	settings: FormattingSettings,
	closestAst?: ASTBase,
	prefix: string = '',
) => {
	const property = closestAst ? getPropertyFromChild(closestAst) : undefined;
	if (!property) return prefix;
	const propertyValueChild = isPropertyValueChild(closestAst);
	const propertyNameWidth = property.propertyName?.name.length ?? 0;
	const widthPrefix = `${widthToPrefix(
		settings,
		propertyNameWidth +
			(propertyValueChild ? 4 : 3) +
			(prefix.length - prefix.trimStart().length),
	)}`;

	return `${widthPrefix}${prefix.trimStart()}`; // +3 ' = ' or + 4 ' = <'
};

const getNodeExpectedNumberOfNewLines = (
	token: Token,
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
) => {
	const isFirstInIfDefBlock = ifDefBlocks
		.flatMap((block) => {
			if (block instanceof IfDefineBlock) {
				return [
					block.ifDef.identifier?.lastToken.nextToken,
					block.elseOption?.keyword.lastToken.nextToken,
				];
			}

			return [
				...block.ifBlocks.map((b) => b.expression?.lastToken.nextToken),
				block.elseOption?.lastToken.nextToken,
			];
		})
		.some((t) => t === token);
	return token.prevToken?.value === '{' || isFirstInIfDefBlock ? 1 : 2;
};

const getPropertyExpectedNumberOfNewLines = (
	property: DtcProperty,
	token: Token,
) => {
	const parentNode =
		property.parentNode instanceof DtcBaseNode
			? property.parentNode
			: undefined;
	const indexInParent = parentNode?.children.indexOf(property) ?? -1;

	if (indexInParent === 0 && parentNode?.openScope === token.prevToken) {
		return {
			newLines: 1,
			force: true,
		};
	}

	const topSibling =
		indexInParent > 0 && parentNode?.children[indexInParent - 1];
	const isTopSiblingANode =
		topSibling instanceof DtcBaseNode &&
		property.firstToken.prevToken ===
			(topSibling.endComment ?? topSibling).lastToken;
	if (isTopSiblingANode) {
		return {
			newLines: 2,
			force: true,
		};
	}

	return {
		newLines: undefined,
		force: undefined,
	};
};

const formatBlockCommentLine = (
	commentItem: Comment,
	commentBlock: CommentBlock,
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	levelMeta: LevelMeta | undefined,
	indentString: string,
	documentText: string[],
	lineType: 'last' | 'first' | 'comment',
	settings: FormattingSettings,
): FileDiagnostic[] => {
	if (!commentItem.firstToken.prevToken) {
		return ensureOnNewLineAndMax1EmptyLineToPrev(
			commentItem.firstToken,
			levelMeta?.level ?? 0,
			indentString,
			documentText,
		);
	}

	if (
		commentItem.firstToken.pos.line ===
		commentItem.firstToken.prevToken?.pos.line
	) {
		return fixedNumberOfSpaceBetweenTokensAndNext(
			commentItem.firstToken.prevToken,
			documentText,
			1,
		);
	}

	if (levelMeta === undefined) {
		return [];
	}

	let forceNumberOfLines: boolean | undefined;
	let expectedNumberOfLines: number | undefined;
	if (
		lineType === 'first' &&
		!commentBlock.astBeforeComment &&
		commentBlock.astAfterComment instanceof DtcBaseNode
	) {
		forceNumberOfLines = true;
		expectedNumberOfLines = getNodeExpectedNumberOfNewLines(
			commentBlock.firstToken,
			ifDefBlocks,
		);
	} else if (
		lineType === 'first' &&
		!commentBlock.astBeforeComment &&
		commentBlock.astAfterComment instanceof DtcProperty
	) {
		const { force, newLines } = getPropertyExpectedNumberOfNewLines(
			commentBlock.astAfterComment,
			commentBlock.firstToken,
		);

		forceNumberOfLines = force;
		expectedNumberOfLines = newLines;
	}

	const result: FileDiagnostic[] = [];
	let prefix: string = '';
	const commentStr = commentItem.toString();
	if (
		lineType === 'last' &&
		commentStr.trim() !== '' &&
		commentItem.lastToken.prevToken
	) {
		lineType = 'comment';
		result.push(
			...ensureOnNewLineAndMax1EmptyLineToPrev(
				commentItem.lastToken.prevToken,
				levelMeta?.level ?? 0,
				indentString,
				documentText,
				' ',
			),
		);
	}

	switch (lineType) {
		case 'comment':
			prefix = commentItem.firstToken.value === '*' ? ' ' : ' * ';
			break;
		case 'first':
			break;
		case 'last':
			prefix = ' ';
			break;
	}

	if (levelMeta?.inAst instanceof DtcBaseNode) {
		result.push(
			...ensureOnNewLineAndMax1EmptyLineToPrev(
				commentItem.firstToken,
				levelMeta?.level ?? 0,
				indentString,
				documentText,
				prefix,
				expectedNumberOfLines,
				forceNumberOfLines,
			),
		);
	} else {
		result.push(
			...ensureOnNewLineAndMax1EmptyLineToPrev(
				commentItem.firstToken,
				levelMeta?.level ?? 0,
				indentString,
				documentText,
				getPropertyIndentPrefix(settings, levelMeta?.inAst, prefix),
				expectedNumberOfLines,
				forceNumberOfLines,
			),
		);
	}

	return result;
};

const formatComment = (
	commentItem: Comment,
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	levelMeta: LevelMeta | undefined,
	indentString: string,
	documentText: string[],
	settings: FormattingSettings,
): FileDiagnostic[] => {
	if (!commentItem.firstToken.prevToken) {
		return ensureOnNewLineAndMax1EmptyLineToPrev(
			commentItem.firstToken,
			levelMeta?.level ?? 0,
			indentString,
			documentText,
		);
	}

	const commentLine = commentItem.firstToken.pos.line;
	if (
		commentLine === commentItem.firstToken.prevToken.pos.line // e.g prop = 10; // foo
	) {
		return [];
	}

	let forceNumberOfLines: boolean | undefined;
	let expectedNumberOfLines: number | undefined;
	if (
		!commentItem.astBeforeComment &&
		commentItem.astAfterComment instanceof DtcBaseNode
	) {
		forceNumberOfLines = true;
		expectedNumberOfLines = getNodeExpectedNumberOfNewLines(
			commentItem.firstToken,
			ifDefBlocks,
		);
	}

	return ensureOnNewLineAndMax1EmptyLineToPrev(
		commentItem.firstToken,
		levelMeta?.level ?? 0,
		indentString,
		documentText,
		getPropertyIndentPrefix(settings, levelMeta?.inAst),
		expectedNumberOfLines,
		forceNumberOfLines,
	);
};

const getTextEdit = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	astNode: ASTBase,
	fsPath: string,
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
	documentText: string[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
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
			astNode,
			includes,
			ifDefBlocks,
			fsPath,
			level,
			singleIndent,
			options,
			documentText,
			computeLevel,
		);
	} else if (astNode instanceof DtcProperty) {
		return formatDtcProperty(
			astNode,
			level,
			settings,
			options,
			documentText,
		);
	} else if (astNode instanceof DeleteBase) {
		return formatDtcDelete(astNode, level, singleIndent, documentText);
	} else if (astNode instanceof Include) {
		return formatDtcInclude(
			astNode,
			fsPath,
			await computeLevel(astNode),
			singleIndent,
			documentText,
		);
	} else if (astNode instanceof Comment && !astNode.disabled) {
		return formatComment(
			astNode,
			ifDefBlocks,
			await computeLevel(astNode),
			singleIndent,
			documentText,
			settings,
		);
	} else if (astNode instanceof CommentBlock && !astNode.disabled) {
		return formatCommentBlock(
			astNode,
			ifDefBlocks,
			await computeLevel(astNode),
			singleIndent,
			documentText,
			settings,
		);
	}

	return [];
};

function getTextFromRange(lines: string[], range: Range): string {
	const startLine = lines[range.start.line];
	const endLine = lines[range.end.line];

	if (range.start.line === range.end.line) {
		// Single-line range
		return startLine.substring(range.start.character, range.end.character);
	}

	// Multi-line range
	const middleLines = lines.slice(range.start.line + 1, range.end.line);
	return [
		startLine.substring(range.start.character),
		...middleLines,
		endLine.substring(0, range.end.character),
	].join('\n');
}
