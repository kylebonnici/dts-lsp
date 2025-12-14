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

import { Position, Range } from 'vscode-languageserver-types';
import { ASTBase } from '../ast/base';
import { Comment, CommentBlock } from '../ast/dtc/comment';
import { FileDiagnostic, Token } from '../types';
import {
	countParent,
	getClosestAstNode,
	getDeepestAstNodeInBetween,
	isRangeInRange,
	positionInBetween,
} from '../helpers';
import { Include } from '../ast/cPreprocessors/include';
import { IfDefineBlock, IfElIfBlock } from '../ast/cPreprocessors/ifDefine';
import type {
	CustomDocumentFormattingParams,
	FormattingSettings,
	LevelMeta,
} from './types';

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

const findAst = async (token: Token, uri: string, fileRootAsts: ASTBase[]) => {
	const pos = Position.create(token.pos.line, token.pos.col);
	const parent = fileRootAsts.find((ast) => positionInBetween(ast, uri, pos));

	if (!parent) return;

	return getDeepestAstNodeInBetween(parent, uri, pos);
};

export const pairFormatOnOff = (
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

export const filterOnOffEdits = (
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

export const getAstItemLevel =
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

export const widthToPrefix = (
	settings: FormattingSettings,
	width: number,
): string => {
	if (settings.insertSpaces) {
		return ''.padStart(width, ' ');
	}

	const noOfTabs = Math.floor(width / settings.tabSize);
	const noOfSpace = width % settings.tabSize;
	return `${''.padStart(noOfTabs, '\t')}${''.padStart(noOfSpace, ' ')}`;
};

export const createIndentString = (
	level: number,
	indentString: string,
	prefix: string,
) => {
	return `${''.padStart(level * indentString.length, indentString)}${prefix}`;
};
