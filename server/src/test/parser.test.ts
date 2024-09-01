/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { LexerToken, Token } from '../lexer';
import { Issue, Issues, Parser, SLXType } from '../parser';
import { describe, test, expect } from '@jest/globals';

const emptyRootNode: Token[] = [
	{
		tokens: [LexerToken.FORWARD_SLASH],
		pos: {
			line: 0,
			col: 0,
			len: 1,
		},
	},
	{
		tokens: [LexerToken.WHITE_SPACE],
		pos: {
			line: 0,
			col: 1,
			len: 1,
		},
		value: '',
	},
	{
		tokens: [LexerToken.CURLY_OPEN],
		pos: {
			line: 0,
			col: 2,
			len: 1,
		},
	},
	{
		tokens: [LexerToken.EOL, LexerToken.WHITE_SPACE],
		pos: {
			line: 0,
			col: 2,
			len: 1,
		},
	},
	{
		tokens: [LexerToken.CURLY_CLOSE],
		pos: {
			line: 1,
			col: 0,
			len: 1,
		},
	},
	{
		tokens: [LexerToken.SEMICOLON],
		pos: {
			line: 1,
			col: 1,
			len: 1,
		},
	},
];

describe('Parser', () => {
	test('Empty docment', async () => {
		const parser = new Parser([]);
		expect(parser.document.type).toEqual(SLXType.SLX);
	});
	describe('Empty root node', () => {
		test('Complete', async () => {
			const parser = new Parser(emptyRootNode);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.children.length).toEqual(1);
			expect(parser.document.children[0].type).toEqual(SLXType.ROOT_DTC);
		});

		test('Missing semicolon', async () => {
			const tokens = emptyRootNode.slice(0, -1);
			const parser = new Parser(tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.END_STATMENT],
				pos: tokens.at(-1)?.pos,
				priority: 2,
			});
		});

		test('Missing close curly only', async () => {
			const tokens = [...emptyRootNode.slice(0, -2), ...emptyRootNode.slice(-1)];
			const parser = new Parser(tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.CURLY_CLOSE],
				pos: tokens.at(-1)?.pos,
				priority: 2,
			});
		});

		test('Missing close curly and semicolon', async () => {
			const tokens = emptyRootNode.slice(0, -2);
			const parser = new Parser(tokens);
			expect(parser.issues.length).toEqual(2);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.CURLY_CLOSE],
				pos: tokens.at(-2)?.pos, // before white space
				priority: 2,
			});
			expect(parser.issues[1]).toEqual({
				issues: [Issues.END_STATMENT],
				pos: tokens.at(-2)?.pos, // before white space
				priority: 2,
			});
		});
	});
});
