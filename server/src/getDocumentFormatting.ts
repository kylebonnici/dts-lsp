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
	FormattingOptions,
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
} from './ast/dtc/node';
import { DtcProperty } from './ast/dtc/property';
import { DeleteBase } from './ast/dtc/delete';
import { ASTBase } from './ast/base';
import {
	FileDiagnostic,
	FileDiagnosticWithEdit,
	FileDiagnosticWithEdits,
	FormattingIssues,
	Token,
} from './types';
import { PropertyValues } from './ast/dtc/values/values';
import { PropertyValue } from './ast/dtc/values/value';
import { AllValueType } from './ast/dtc/types';
import { ArrayValues } from './ast/dtc/values/arrayValue';
import { ByteStringValue } from './ast/dtc/values/byteString';
import { LabeledValue } from './ast/dtc/values/labeledValue';
import { Include } from './ast/cPreprocessors/include';
import {
	applyEdits,
	coreSyntaxIssuesFilter,
	fileURLToPath,
	genFormattingDiagnostic,
	getDeepestAstNodeInBetween,
	isPathEqual,
	isRangeInRange,
	positionInBetween,
	rangesOverlap,
	sameLine,
	toPosition,
	toRange,
} from './helpers';
import { Comment, CommentBlock } from './ast/dtc/comment';
import { LabelAssign } from './ast/dtc/label';
import { ComplexExpression, Expression } from './ast/cPreprocessors/expression';
import { CMacroCall } from './ast/cPreprocessors/functionCall';
import { getPropertyFromChild, isPropertyValueChild } from './ast/helpers';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { Parser } from './parser';
import { Lexer } from './lexer';
import {
	CElse,
	CIf,
	CIfBase,
	IfDefineBlock,
	IfElIfBlock,
} from './ast/cPreprocessors/ifDefine';
import { NumberValue } from './ast/dtc/values/number';

const findAst = async (token: Token, uri: string, fileRootAsts: ASTBase[]) => {
	const pos = Position.create(token.pos.line, token.pos.col);
	const parent = fileRootAsts.find((ast) => positionInBetween(ast, uri, pos));

	if (!parent) return;

	return getDeepestAstNodeInBetween(parent, uri, pos);
};

const getClosestAstNode = (ast?: ASTBase): DtcBaseNode | undefined => {
	if (!ast) {
		return;
	}
	return ast instanceof DtcBaseNode
		? ast
		: getClosestAstNode(ast?.parentNode);
};

export const countParent = (
	uri: string,
	node?: DtcBaseNode,
	count = 0,
): number => {
	if (!node || !node.parentNode?.uri) return count;

	const closeAst = getClosestAstNode(node.parentNode);
	return countParent(uri, closeAst, count + 1);
};

type LevelMeta = {
	level: number;
	inAst?: ASTBase;
};
const getAstItemLevel =
	(fileRootAsts: ASTBase[], uri: string) =>
	async (astNode: ASTBase): Promise<LevelMeta | undefined> => {
		const rootItem = fileRootAsts.filter(
			(ast) =>
				!(ast instanceof Include) &&
				!(ast instanceof Comment) &&
				!(ast instanceof CommentBlock) &&
				!(ast instanceof IfDefineBlock) &&
				!(ast instanceof IfElIfBlock),
		);
		const parentAst = await findAst(astNode.firstToken, uri, rootItem);

		if (
			!parentAst ||
			parentAst === astNode ||
			astNode.allDescendants.some((a) => a === parentAst)
		) {
			return {
				level: 0,
			};
		}

		const closeAst = getClosestAstNode(parentAst);
		const level = countParent(uri, closeAst);
		return {
			level,
			inAst: parentAst,
		};
	};

type FormattingFlags = {
	runBaseCheck: boolean;
	runLongLineCheck: boolean;
};
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

export async function formatText(
	documentFormattingParams:
		| DocumentFormattingParams
		| DocumentRangeFormattingParams,
	text: string,
	returnType: 'Both',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<{ text: string; diagnostic: FileDiagnostic[] }>;
export async function formatText(
	documentFormattingParams:
		| DocumentFormattingParams
		| DocumentRangeFormattingParams,
	text: string,
	returnType: 'New Text',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<string>;
export async function formatText(
	documentFormattingParams:
		| DocumentFormattingParams
		| DocumentRangeFormattingParams,
	text: string,
	returnType: 'File Diagnostics',
	options?: FormattingFlags,
	tokens?: Token[],
	prevIfBlocks?: (IfDefineBlock | IfElIfBlock)[],
	processedPrevIfBlocks?: CIfBase[],
): Promise<FileDiagnostic[]>;
export async function formatText(
	documentFormattingParams:
		| DocumentFormattingParams
		| DocumentRangeFormattingParams,
	text: string,
	returnType: 'New Text' | 'File Diagnostics' | 'Both',
	options: FormattingFlags = {
		runBaseCheck: true,
		runLongLineCheck: true,
	},
	tokens?: Token[],
	prevIfBlocks: (IfDefineBlock | IfElIfBlock)[] = [],
	processedPrevIfBlocks: CIfBase[] = [],
): Promise<
	string | FileDiagnostic[] | { text: string; diagnostic: FileDiagnostic[] }
> {
	const filePath = fileURLToPath(documentFormattingParams.textDocument.uri);
	tokens ??= new Lexer(text, filePath).tokens;
	const rawTokens = [...tokens];
	let parser = new Parser(filePath, [], undefined, () => tokens, true);
	await parser.stable;

	const issues = parser.issues.filter((issue) =>
		coreSyntaxIssuesFilter(issue.raw, filePath, false),
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
				filePath,
				text,
				returnType,
				options,
				variantDocuments,
			);
			variantDocuments = [];
			finalText = r;
		}

		if (
			hasLongLines(
				finalText,
				documentFormattingParams.options.tabSize,
				wordWrapColumn,
			)
		) {
			let prevText = '';
			do {
				prevText = finalText;
				let allAstItems = parser.allAstItems;
				if (prevText !== text) {
					const parser = new Parser(
						filePath,
						[],
						undefined,
						() => {
							const lexer = new Lexer(prevText, filePath);
							return lexer.tokens;
						},
						true,
					);
					await parser.stable;
					allAstItems = parser.allAstItems;
				}

				finalText = await formatLongLines(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					allAstItems,
					filePath,
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
				filePath,
				text,
				returnType,
				options,
				[...variantDocuments],
			);
			finalText = r.text;
			diagnostic.push(...r.diagnostic);
		}

		if (
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
					filePath,
					text,
					'File Diagnostics',
					options,
					[...variantDocuments],
				)),
			);

			let prevText = '';
			do {
				prevText = finalText;
				let allAstItems = parser.allAstItems;
				if (prevText !== text) {
					const parser = new Parser(
						filePath,
						[],
						undefined,
						() => {
							const lexer = new Lexer(prevText, filePath);
							return lexer.tokens;
						},
						true,
					);
					await parser.stable;
					allAstItems = parser.allAstItems;
				}

				finalText = await formatLongLines(
					{
						...documentFormattingParams,
						options: {
							...documentFormattingParams.options,
							wordWrapColumn,
						},
					},
					allAstItems,
					filePath,
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
			filePath,
			text,
			returnType,
			options,
			[...variantDocuments],
		);
		diagnostic.push(...r);
	}

	if (
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
				filePath,
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

const filterOnOffEdits = (
	formatOnOffMeta: Range[],
	settings: CustomDocumentFormattingParams,
	result: FileDiagnostic[],
) => {
	let resultExcludingOnOfRanges = formatOnOffMeta.length
		? result.filter((i) => {
				const edits = Array.isArray(i.raw.edit)
					? i.raw.edit
					: i.raw.edit
						? [i.raw.edit]
						: undefined;
				return edits?.every(
					(e) =>
						!isFormattingDisabledAt(
							e.range.start,
							formatOnOffMeta,
						) &&
						!isFormattingDisabledAt(e.range.end, formatOnOffMeta),
				);
			})
		: result;

	if ('range' in settings) {
		resultExcludingOnOfRanges = resultExcludingOnOfRanges.filter((d) =>
			isRangeInRange(settings.range, d.raw.range),
		);
	}

	return resultExcludingOnOfRanges;
};

export type CustomDocumentFormattingParams = (
	| DocumentFormattingParams
	| DocumentRangeFormattingParams
) & {
	options: FormattingOptions & {
		wordWrapColumn: number;
	};
};

async function formatAstBaseItems(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	uri: string,
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
	uri: string,
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
	uri: string,
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
	uri: string,
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
			uri,
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
		TextDocument.create(uri, 'devicetree', 0, text),
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
	uri: string,
	splitDocument: string[],
	options: FormattingFlags,
): Promise<FileDiagnostic[]> {
	const astItemLevel = getAstItemLevel(astItems, uri);

	const result: FileDiagnostic[] = (
		await Promise.all(
			astItems.flatMap(
				async (base) =>
					await getTextEdit(
						documentFormattingParams,
						base,
						uri,
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
				uri,
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
					uri,
					Position.create(lineNumber, 0),
					{ edit, codeActionTitle: 'Remove trailing EOF lines' },
				),
			);
		}
	}

	const allEdits = result.flatMap((i) => i.raw.edit).filter((i) => !!i);

	if (documentFormattingParams.options.trimTrailingWhitespace) {
		const issues = removeTrailingWhitespace(splitDocument, allEdits, uri);
		result.push(...issues);
	}

	return result;
}

const pairFormatOnOff = (
	fileRootAsts: ASTBase[],
	documentLines: string[],
): Range[] => {
	const last = Position.create(
		documentLines.length - 1,
		documentLines.at(-1)?.length ?? 0,
	);

	const formatControlRanges: Range[] = [];
	let pendingOff: { start: Position } | undefined;

	const controlComments = fileRootAsts
		.filter(
			(ast) =>
				(ast instanceof CommentBlock || ast instanceof Comment) &&
				/^dts-format (on|off)$/.test(ast.toString().trim()),
		)

		.sort((a, b) => a.firstToken.pos.line - b.firstToken.pos.line);

	controlComments.forEach((ast) => {
		const value = ast.toString().trim();

		if (value === 'dts-format off') {
			pendingOff = {
				start: Position.create(
					ast.firstToken.pos.line,
					ast instanceof CommentBlock ? ast.firstToken.pos.colEnd : 0,
				),
			};
		} else if (value === 'dts-format on' && pendingOff) {
			const end = Position.create(
				ast.lastToken.pos.line,
				ast instanceof CommentBlock
					? ast.lastToken.pos.colEnd - 1
					: documentLines[ast.lastToken.pos.line - 1].length,
			);
			formatControlRanges.push(Range.create(pendingOff.start, end));
			pendingOff = undefined;
		}
	});

	// If still "off" with no "on", use last known AST node as document end
	if (pendingOff) {
		formatControlRanges.push(Range.create(pendingOff.start, last));
	}

	return formatControlRanges;
};

function comparePositions(a: Position, b: Position): number {
	if (a.line < b.line) return -1;
	if (a.line > b.line) return 1;
	if (a.character < b.character) return -1;
	if (a.character > b.character) return 1;
	return 0;
}

const isFormattingDisabledAt = (
	pos: Position,
	disabledRanges: Range[],
): boolean => {
	return disabledRanges.some(
		(range) =>
			comparePositions(pos, range.start) >= 0 &&
			comparePositions(pos, range.end) <= 0,
	);
};

const removeTrailingWhitespace = (
	documentText: string[],
	textEdits: TextEdit[],
	uri: string,
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
						uri,
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
				token.uri,
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
			token.uri,
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
			token.uri,
			start,
			{ edit, codeActionTitle: 'Move to new line' },
			end,
		);
	}
};

const createIndentString = (
	level: number,
	indentString: string,
	prefix: string,
) => {
	return `${''.padStart(level * indentString.length, indentString)}${prefix}`;
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
			token.uri,
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
				token.uri,
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
				token.uri,
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
			token.uri,
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
): FileDiagnostic[] => {
	return labels
		.slice(1)
		.flatMap((label) =>
			label.firstToken.prevToken
				? fixedNumberOfSpaceBetweenTokensAndNext(
						label.firstToken.prevToken,
						documentText,
					)
				: [],
		);
};

const formatDtcNode = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	node: DtcBaseNode,
	includes: Include[],
	ifDefBlocks: (IfDefineBlock | IfElIfBlock)[],
	uri: string,
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
		result.push(...formatLabels(node.labels, documentText));

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
					if (lowerCaseAddr !== rawAddressString) {
						result.push(
							genFormattingDiagnostic(
								FormattingIssues.HEX_TO_LOWER_CASE,
								address.uri,
								toPosition(address.firstToken, false),
								{
									edit: TextEdit.replace(
										toRange(address),
										lowerCaseAddr,
									),
									codeActionTitle: `Change to '${lowerCaseAddr}'`,
								},
								toPosition(address.lastToken),
							),
						);
					}
				});
			}
			if (
				node.labels.length &&
				node.name &&
				node.name.firstToken.prevToken
			) {
				result.push(
					...fixedNumberOfSpaceBetweenTokensAndNext(
						node.name.firstToken.prevToken,
						documentText,
					),
				);
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
						uri,
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
	openBracket: Token | undefined,
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(...formatLabels(value.labels, documentText));

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
					value.value.uri,
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
							value.closeBracket.prevToken ===
								value.values.at(-1)?.lastToken
								? 0
								: 1,
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
				),
			);
		}
		result.push(
			...formatExpression(
				join.expression,
				documentText,
				level,
				settings,
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
				value.uri,
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
	documentText: string[],
): FileDiagnostic[] => {
	const result: FileDiagnostic[] = [];

	result.push(...formatLabels(value.startLabels, documentText));

	result.push(
		...formatValue(
			propertyNameWidth,
			value.value,
			level,
			settings,
			documentText,
		),
	);

	result.push(...formatLabels(value.endLabels, documentText));

	return result;
};

const widthToPrefix = (settings: FormattingSettings, width: number): string => {
	if (settings.insertSpaces) {
		return ''.padStart(width, ' ');
	}

	const noOfTabs = Math.floor(width / settings.tabSize);
	const noOfSpace = width % settings.tabSize;
	return `${''.padStart(noOfTabs, '\t')}${''.padStart(noOfSpace, ' ')}`;
};

const formatPropertyValues = (
	propertyNameWidth: number,
	propName: string,
	values: PropertyValues,
	level: number,
	settings: FormattingSettings,
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

	result.push(...formatLabels(property.labels, documentText));

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
				property.propertyName?.name ?? '',
				property.values,
				level,
				settings,
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
				token.uri,
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
			token.uri,
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
	uri: string,
	levelMeta: LevelMeta | undefined,
	indentString: string,
	documentText: string[],
): FileDiagnostic[] => {
	// we should not format this case
	if (levelMeta === undefined) return [];

	if (!isPathEqual(includeItem.uri, uri)) return []; // may be coming from some other include  hence ignore

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

type FormattingSettings = {
	tabSize: number;
	insertSpaces: boolean;
	singleIndent: string;
	wordWrapColumn: number;
};

const getTextEdit = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	astNode: ASTBase,
	uri: string,
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
			uri,
			level,
			singleIndent,
			options,
			documentText,
			computeLevel,
		);
	} else if (astNode instanceof DtcProperty) {
		return formatDtcProperty(astNode, level, settings, documentText);
	} else if (astNode instanceof DeleteBase) {
		return formatDtcDelete(astNode, level, singleIndent, documentText);
	} else if (astNode instanceof Include) {
		return formatDtcInclude(
			astNode,
			uri,
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

function needWrapping(
	firstToken: Token,
	lastToken: Token,
	settings: FormattingSettings,
	documentLines: string[],
) {
	if (!sameLine(firstToken, lastToken)) {
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

async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'File Diagnostics',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<FileDiagnostic[]>;
async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
	text: string,
	returnType: 'New Text',
	options: FormattingFlags,
	edits?: FileDiagnostic[],
): Promise<string>;
async function formatLongLines(
	documentFormattingParams: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	uri: string,
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
			uri,
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
		TextDocument.create(uri, 'devicetree', 0, text),
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
	uri: string,
	splitDocument: string[],
	options: FormattingFlags,
): Promise<FileDiagnostic[]> {
	const astItemLevel = getAstItemLevel(astItems, uri);

	const result: FileDiagnostic[] = (
		await Promise.all(
			astItems.flatMap(
				async (base) =>
					await getWrapLineEdit(
						documentFormattingParams,
						base,
						uri,
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
	uri: string,
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
			uri,
			level,
			options,
			documentText,
			computeLevel,
		);
	} else if (astNode instanceof DtcProperty) {
		return formatLongLinesDtcProperty(
			astNode,
			level,
			settings,
			documentText,
			singleIndent,
		);
	}

	return [];
};

const formatLongLinesDtcNode = async (
	documentFormattingParams: CustomDocumentFormattingParams,
	node: DtcBaseNode,
	uri: string,
	level: number,
	options: FormattingFlags,
	documentText: string[],
	computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
): Promise<FileDiagnostic[]> => {
	const result: FileDiagnostic[] = [];

	result.push(
		...(
			await Promise.all(
				node.children.flatMap((c) =>
					getWrapLineEdit(
						documentFormattingParams,
						c,
						uri,
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

const formatLongLinesDtcProperty = (
	property: DtcProperty,
	level: number,
	settings: FormattingSettings,
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
			property.propertyName?.name.length ?? 0,
			property.values,
			level,
			settings,
			documentText,
			singleIndent,
			property.lastToken,
		);
	}

	return [];
};

const formatLongLinesPropertyValues = (
	propertyNameWidth: number,
	values: PropertyValues,
	level: number,
	settings: FormattingSettings,
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
	documentText: string[],
	singleIndent: string,
	semicolon?: Token,
): FileDiagnostic[] | undefined => {
	const valueEnd = value.nextValueSeparator ?? semicolon;
	const wrapping = needWrapping(
		value.firstToken,
		value.nextValueSeparator
			? value.nextValueSeparator
			: (valueEnd ?? value.lastToken),
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
				propertyNameWidth,
				innerValue,
				level,
				settings,
				documentText,
				singleIndent,
				valueEnd,
			);
		}

		if (innerValue instanceof Expression) {
			return formatLongLinesExpression(
				propertyNameWidth,
				innerValue,
				level,
				settings,
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
				propertyNameWidth,
				innerValue,
				level,
				settings,
				documentText,
				singleIndent,
				valueEnd,
			);
		}

		if (innerValue instanceof Expression) {
			return formatLongLinesExpression(
				propertyNameWidth,
				innerValue,
				level,
				settings,
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
			value.firstToken.uri,
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
	propertyNameWidth: number,
	innerValue: ArrayValues | ByteStringValue,
	level: number,
	settings: FormattingSettings,
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
				propertyNameWidth,
				value.value,
				level,
				settings,
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
				value.firstToken.uri,
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
	propertyNameWidth: number,
	expression: Expression,
	level: number,
	settings: FormattingSettings,
	documentText: string[],
	indentString: string,
	canWrapWholeExpression = false,
	expressionLevel: number = 0,
): FileDiagnostic[] | undefined => {
	const line = documentText[expression.firstToken.pos.line].substring(
		0,
		expression.firstToken.pos.col,
	);

	const a = Math.trunc((propertyNameWidth + 4) / settings.tabSize);
	const b = (propertyNameWidth + 4) % settings.tabSize;
	const minWidth2 = a + b + level;
	const minWidth =
		line.trimStart() !== '' ? level + propertyNameWidth + 4 : minWidth2; // ` = `
	if (canWrapWholeExpression && expression.firstToken.pos.col !== minWidth) {
		return [
			genFormattingDiagnostic(
				FormattingIssues.LONG_LINE_WRAP,
				expression.firstToken.uri,
				toPosition(expression.firstToken, false),
				{
					edit: [
						TextEdit.replace(
							Range.create(
								toPosition(expression.firstToken.prevToken!),
								toPosition(expression.firstToken, false),
							),
							`\n${createIndentString(level, indentString, widthToPrefix(settings, propertyNameWidth + 4))}`,
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

		if (wrap === null) {
			// Value is on multiple lines so we need to go deeper
			return formatLongLinesExpression(
				propertyNameWidth,
				exp.expression,
				level,
				settings,
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
				exp.expression.firstToken.uri,
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
							`\n${createIndentString(level, indentString, widthToPrefix(settings, propertyNameWidth + 4))}`,
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
