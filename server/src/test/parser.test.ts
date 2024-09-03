/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Lexer, LexerToken, Token } from '../lexer';
import { Issue, Issues, Parser, SLXType } from '../parser';
import { describe, test, expect } from '@jest/globals';

describe('Parser', () => {
	test('Empty docment', async () => {
		const parser = new Parser([]);
		expect(parser.document.type).toEqual(SLXType.SLX);
	});
	describe('Empty root node', () => {
		test('Complete', async () => {
			const rootNode = '/{ \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.children.length).toEqual(1);
			expect(parser.document.children[0].type).toEqual(SLXType.ROOT_DTC);
			expect(parser.document.children[0].tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(parser.document.children[0].tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(parser.document.children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.document.children[0].tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 1,
			});
		});

		test('Missing semicolon', async () => {
			const rootNode = '/{ \n}';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.END_STATMENT],
				pos: { len: 1, line: 1, col: 0 },
				priority: 2,
			});

			expect(parser.document.children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_CLOSE])
			);
			expect(parser.document.children[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly only', async () => {
			const rootNode = '/{ \n;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.CURLY_CLOSE],
				pos: { line: 0, col: 1, len: 1 },
				priority: 2,
			});

			expect(parser.document.children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.document.children[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly and semicolon', async () => {
			const rootNode = '/{ \n';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(2);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.CURLY_CLOSE],
				pos: { len: 1, col: 1, line: 0 }, // before white space
				priority: 2,
			});
			expect(parser.issues[1]).toEqual({
				issues: [Issues.END_STATMENT],
				pos: { len: 1, col: 1, line: 0 }, // before white space
				priority: 2,
			});

			expect(parser.document.children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_OPEN])
			);
			expect(parser.document.children[0].tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 0,
			});
		});
	});

	describe('Root node with property', () => {
		test('Complete', async () => {
			const rootNode = '/{ \nprop1;\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.children.length).toEqual(1);
			expect(parser.document.children[0].type).toEqual(SLXType.ROOT_DTC);

			expect(parser.document.children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.document.children[0].tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 2,
			});

			// property
			expect(parser.document.children[0].children.length).toEqual(1);
			expect(parser.document.children[0].children[0].type).toEqual(SLXType.PROPERTY);

			expect(parser.document.children[0].children[0].tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(parser.document.children[0].children[0].tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(parser.document.children[0].children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.document.children[0].children[0].tokenIndexes?.end?.pos).toEqual({
				col: 5,
				len: 1,
				line: 1,
			});
		});

		test('Prop missing semicolon', async () => {
			const rootNode = '/{ \nprop1\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0]).toEqual({
				issues: [Issues.END_STATMENT],
				pos: { len: 5, line: 1, col: 0 },
				priority: 3,
			});
			expect(parser.document.children.length).toEqual(1);
			expect(parser.document.children[0].type).toEqual(SLXType.ROOT_DTC);

			expect(parser.document.children[0].children.length).toEqual(1);
			expect(parser.document.children[0].children[0].type).toEqual(SLXType.PROPERTY);

			expect(parser.document.children[0].children[0].tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(parser.document.children[0].children[0].tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(parser.document.children[0].children[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(parser.document.children[0].children[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});
		});
	});
});
