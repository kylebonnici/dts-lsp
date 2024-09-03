/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Lexer, LexerToken, Token } from '../lexer';
import {
	Issue,
	Issues,
	NumbersValue,
	Parser,
	PropertyValue,
	PropertyValues,
	SLXType,
} from '../parser';
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
			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(node.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 1,
			});
		});

		test('Missing semicolon', async () => {
			const rootNode = '/{ \n}';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([Issues.END_STATMENT]);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, line: 1, col: 0 });

			expect(parser.document.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_CLOSE])
			);
			expect(parser.document.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly only', async () => {
			const rootNode = '/{ \n;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([Issues.CURLY_CLOSE]);
			expect(parser.issues[0].token?.pos).toEqual({ line: 0, col: 1, len: 1 });

			expect(parser.document.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.document.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly and semicolon', async () => {
			const rootNode = '/{ \n';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(2);
			expect(parser.issues[0].issues).toEqual([Issues.CURLY_CLOSE]);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, col: 1, line: 0 });
			expect(parser.issues[1].issues).toEqual([Issues.END_STATMENT]);
			expect(parser.issues[1].token?.pos).toEqual({ len: 1, col: 1, line: 0 });

			expect(parser.document.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_OPEN])
			);
			expect(parser.document.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 0,
			});
		});
	});

	describe('Root node with property no value', () => {
		test('Complete', async () => {
			const rootNode = '/{ \nprop1;\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];

			expect(node.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 2,
			});

			// property
			expect(node.properties.length).toEqual(1);
			const property = node.properties[0];

			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 5,
				len: 1,
				line: 1,
			});
		});

		test('Prop missing semicolon', async () => {
			const rootNode = '/{ \nprop1\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([Issues.END_STATMENT]);
			expect(parser.issues[0].token?.pos).toEqual({ len: 5, line: 1, col: 0 });

			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];
			expect(node.type).toEqual(SLXType.ROOT_DTC);

			expect(node.properties.length).toEqual(1);
			const property = node.properties[0];

			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});
		});

		test('Prop missing semicolon + node missing end curly and semicolon', async () => {
			const rootNode = '/{ \nprop1';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(3);
			expect(parser.issues[0].issues).toEqual([Issues.END_STATMENT]);
			expect(parser.issues[0].token?.pos).toEqual({ len: 5, line: 1, col: 0 });
			expect(parser.issues[1].issues).toEqual([Issues.CURLY_CLOSE]);
			expect(parser.issues[1].token?.pos).toEqual({ len: 5, col: 0, line: 1 });
			expect(parser.issues[2].issues).toEqual([Issues.END_STATMENT]);
			expect(parser.issues[2].token?.pos).toEqual({ len: 5, col: 0, line: 1 });

			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];

			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(node.properties.length).toEqual(1);
			const property = node.properties[0];

			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});
		});
	});

	describe('Root node with property with single value', () => {
		test('Complete', async () => {
			const rootNode = '/{ \nprop1= < 10 >;\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];

			expect(node.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 2,
			});

			// ---- property ----
			expect(node.properties.length).toEqual(1);
			const property = node.properties[0];

			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			// ------------ value -----------
			const values = property.value;
			expect(values?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values?.tokenIndexes?.end?.pos).toEqual({
				col: 12,
				len: 1,
				line: 1,
			});

			expect(values?.value.length).toBe(1);
			const value = values?.value[0] ?? null;

			expect(value).toBeDefined();
			expect(value?.value instanceof NumbersValue).toBeDefined();
			const numberValue = value?.value as NumbersValue;

			expect(numberValue.value[0].value).toBe(10);
			expect(numberValue.tokenIndexes?.start?.pos).toEqual({
				col: 9,
				len: 2,
				line: 1,
			});
			expect(numberValue.tokenIndexes?.end?.pos).toEqual({
				col: 9,
				len: 2,
				line: 1,
			});

			// ------------ value end -----------

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 13,
				len: 1,
				line: 1,
			});
			// ---- property end ----
		});
	});
});
