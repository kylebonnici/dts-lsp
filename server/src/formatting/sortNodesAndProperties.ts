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

import { Position, Range, TextEdit } from 'vscode-languageserver-types';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { ASTBase } from '../ast/base';
import { FileDiagnostic, FormattingIssues } from '../types';
import {
	applyEdits,
	compareWords,
	genFormattingDiagnostic,
	isPathEqual,
	positionAfter,
	positionInBetween,
	toPosition,
} from '../helpers';
import { Include } from '../ast/cPreprocessors/include';
import {
	DtcBaseNode,
	DtcChildNode,
	DtcRefNode,
	DtcRootNode,
} from '../ast/dtc/node';
import { IfDefineBlock, IfElIfBlock } from '../ast/cPreprocessors/ifDefine';
import { DtcProperty } from '../ast/dtc/property';
import { DeleteBase } from '../ast/dtc/delete';
import { Parser } from '../parser';
import { Lexer } from '../lexer';
import {
	convertToFormattingFlags,
	filterOnOffEdits,
	isFormattingDisabledAt,
	pairFormatOnOff,
} from './helpers';
import { CustomDocumentFormattingParams } from './types';

export async function sortNodesAndProperties(
	settings: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text',
	includes: Include[],
	ifDefs: (IfDefineBlock | IfElIfBlock)[],
): Promise<string>;
export async function sortNodesAndProperties(
	settings: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'File Diagnostics',
	includes: Include[],
	ifDefs: (IfDefineBlock | IfElIfBlock)[],
): Promise<FileDiagnostic[]>;
export async function sortNodesAndProperties(
	settings: CustomDocumentFormattingParams,
	astItems: ASTBase[],
	fsPath: string,
	text: string,
	returnType: 'New Text' | 'File Diagnostics',
	includes: Include[],
	ifDefs: (IfDefineBlock | IfElIfBlock)[],
): Promise<string | FileDiagnostic[]> {
	const splitDocument = text.split('\n');
	const formatOnOffMeta = pairFormatOnOff(astItems, splitDocument);

	const t = astItems.flatMap((c) =>
		c instanceof DtcBaseNode
			? sortNodesAndPropertiesHelper(
					settings,
					c,
					fsPath,
					includes,
					ifDefs,
					splitDocument,
					formatOnOffMeta,
				)
			: [],
	);

	const newText = applyEdits(
		TextDocument.create(fsPath, 'devicetree', 0, text),
		filterOnOffEdits(formatOnOffMeta, settings, t)
			.flatMap((i) => i.raw.edit)
			.filter((e) => !!e),
	);

	if (t.flatMap((d) => d.raw.edit).filter((e) => !!e).length) {
		const parser = new Parser(
			fsPath,
			[],
			undefined,
			() => {
				const lexer = new Lexer(newText, fsPath);
				return lexer.tokens;
			},
			true,
		);
		await parser.stable;

		switch (returnType) {
			case 'New Text':
				return sortNodesAndProperties(
					settings,
					parser.allAstItems,
					fsPath,
					newText,
					'New Text',
					parser.includes,
					parser.cPreprocessorParser.allAstItems.filter(
						(a) =>
							a instanceof IfDefineBlock ||
							a instanceof IfElIfBlock,
					),
				);
			case 'File Diagnostics':
				return t;
		}
	}

	switch (returnType) {
		case 'New Text':
			return newText;
		case 'File Diagnostics':
			return t;
	}
}

function sortNodesAndPropertiesHelper(
	settings: CustomDocumentFormattingParams,
	node: DtcBaseNode,
	fsPath: string,
	includes: Include[],
	ifDefs: (IfDefineBlock | IfElIfBlock)[],
	splitDocument: string[],
	formatOff: Range[],
): FileDiagnostic[] {
	if (!isPathEqual(node.fsPath, fsPath)) return []; //property may have been included!!

	if (
		ifDefs.some(
			(i) =>
				positionInBetween(
					node,
					fsPath,
					Position.create(
						i.firstToken.pos.line,
						i.firstToken.pos.col,
					),
				) ||
				positionInBetween(
					node,
					fsPath,
					Position.create(
						i.lastToken.pos.line,
						i.lastToken.pos.colEnd,
					),
				),
		)
	) {
		return [];
	}

	const groups: {
		asFound: (DtcProperty | DtcChildNode)[];
		prop: DtcProperty[];
		nodes: DtcChildNode[];
	}[] = [{ prop: [], nodes: [], asFound: [] }];

	const issues: FileDiagnostic[] = [];

	let includesInNode = includes.filter((i) =>
		positionInBetween(
			node,
			fsPath,
			Position.create(i.firstToken.pos.line, i.firstToken.pos.col),
		),
	);

	node.children.forEach((c) => {
		const includeAfter = includesInNode.filter((i) =>
			positionAfter(
				c.firstToken,
				fsPath,
				Position.create(i.firstToken.pos.line, i.firstToken.pos.col),
			),
		);
		if (
			includeAfter.length !== includesInNode.length &&
			includesInNode.length
		) {
			groups.push({ prop: [], nodes: [], asFound: [] });
			includesInNode = includeAfter;
		}

		if (c instanceof DtcProperty) {
			groups.at(-1)?.prop.push(c);
			groups.at(-1)?.asFound.push(c);
		} else if (c instanceof DtcChildNode) {
			groups.at(-1)?.nodes.push(c);
			groups.at(-1)?.asFound.push(c);
		} else if (c instanceof DeleteBase) {
			groups.push({ prop: [], nodes: [], asFound: [] });
		}
	});

	const genStartEnd = (item: DtcBaseNode | DtcProperty) => ({
		start: item.topComment ?? item,
		end: item.endComment ?? item,
	});

	const options = convertToFormattingFlags(settings.options);

	groups.forEach((grp) => {
		const sortedProps = [...grp.prop].sort((a, b) =>
			sortProperties(a, b, options.sortPropertiesAlphabetically),
		);
		const sortedNodes = options.sortNodesNodesBy
			? [...grp.nodes].sort((a, b) => {
					if (options.sortNodesNodesBy === 'name') {
						return (
							a.name?.value.localeCompare(b.name?.value ?? '') ??
							0
						);
					}

					if (options.sortNodesNodesBy === 'address') {
						return compareWords(
							a.name?.address?.at(0)?.address ?? [0],
							b.name?.address?.at(0)?.address ?? [0],
						);
					}

					return 0;
				})
			: [...grp.nodes];
		const expectedOrder = [...sortedProps, ...sortedNodes];
		if (
			!expectedOrder.length ||
			expectedOrder.every(
				(item, index) =>
					!expectedOrder.at(index + 1) ||
					positionAfter(
						item.lastToken,
						fsPath,
						Position.create(
							expectedOrder.at(index + 1)!.firstToken.pos.line,
							expectedOrder.at(index + 1)!.firstToken.pos.col,
						),
					),
			)
		) {
			return;
		}

		const { start: grpStart } = genStartEnd(grp.asFound[0]);
		const grpStartPosition = Position.create(
			grpStart.firstToken.prevToken?.pos.line ??
				grpStart.firstToken.pos.line,
			grpStart.firstToken.prevToken?.pos.colEnd ??
				grpStart.firstToken.pos.col,
		);

		const changesMap = expectedOrder.map((item) => {
			const { start, end } = genStartEnd(item);
			const startLine =
				start.firstToken.prevToken?.pos.line ??
				start.firstToken.pos.line;
			const startCol =
				start.firstToken.prevToken?.pos.colEnd ??
				start.firstToken.pos.col;
			const endLine = end.lastToken.pos.line;
			const endCol = end.lastToken?.pos.colEnd;

			const sameLine = startLine === endLine;
			let text = '';
			if (sameLine) {
				text = splitDocument[startLine].slice(startCol, endCol);
			} else {
				const textLines = splitDocument.slice(startLine, endLine + 1);
				textLines[0] = textLines[0].slice(startCol);
				textLines[textLines.length - 1] = textLines[
					textLines.length - 1
				].slice(0, endCol);
				text = textLines.join('\n');
			}

			return {
				delete: TextEdit.del(
					Range.create(
						Position.create(startLine, startCol),
						Position.create(endLine, endCol),
					),
				),
				insert: TextEdit.insert(grpStartPosition, text),
				item,
				text,
			};
		});

		const edits = formatOff.length
			? changesMap.filter(
					(edit) =>
						!isFormattingDisabledAt(
							edit.delete.range.start,
							formatOff,
						) &&
						!isFormattingDisabledAt(
							edit.delete.range.end,
							formatOff,
						),
				)
			: changesMap;

		const nameToSelect =
			node instanceof DtcRefNode
				? node.reference
				: node instanceof DtcChildNode
					? node.name
					: node instanceof DtcRootNode
						? node.name
						: undefined;

		if (edits.length) {
			issues.push(
				genFormattingDiagnostic(
					FormattingIssues.PROPERTY_NODE_SORTING,
					fsPath,
					toPosition(
						nameToSelect?.firstToken ?? node.firstToken,
						false,
					),
					{
						edit:
							changesMap.length === edits.length
								? [
										...edits.map((a) => a.delete),
										TextEdit.insert(
											grpStartPosition,
											edits.map((a) => a.text).join(''),
										),
									]
								: [],
						codeActionTitle: `Sort child items. Expected order: ${expectedOrder.map((e) => (e instanceof DtcProperty ? `${e.propertyName.name}` : `${e.path?.at(-1)} { ... };`)).join(', ')}`,
					},
					toPosition(
						nameToSelect?.lastToken ??
							node.openScope ??
							node.firstToken,
					),
				),
			);
		}
	});

	if (!issues.length) {
		return node.children.flatMap((c) =>
			c instanceof DtcBaseNode
				? sortNodesAndPropertiesHelper(
						settings,
						c,
						fsPath,
						includes,
						ifDefs,
						splitDocument,
						formatOff,
					)
				: [],
		);
	}

	return issues;
}

const priority: Record<string, number> = {
	compatible: 0,
	reg: 1,
	ranges: 2,
	status: 99, // status goes last if present
};

function getPriority(name: string): number {
	if (priority.hasOwnProperty(name)) {
		return priority[name];
	}
	if (!name.includes(',')) {
		// Standard/common properties (no vendor prefix)
		return 3;
	}
	// Vendor-specific properties (have vendor prefix)
	return 4;
}

function sortProperties(
	a: DtcProperty,
	b: DtcProperty,
	sortAlphabetically: boolean,
): number {
	const aPriority = getPriority(a.propertyName?.name ?? '');
	const bPriority = getPriority(b.propertyName?.name ?? '');

	if (aPriority !== bPriority) {
		return aPriority - bPriority;
	}

	return sortAlphabetically
		? a.propertyName.name.localeCompare(b.propertyName.name)
		: 0;
}
