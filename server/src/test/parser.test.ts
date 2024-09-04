/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Lexer, LexerToken, Token } from '../lexer';
import {
	ByteStringValue,
	DtcNode,
	DtcRootNode,
	Issues,
	LabelRef,
	LabelRefValue,
	NodeName,
	NumberValues as NumberValues,
	Parser,
} from '../parser';
import { describe, test, expect } from '@jest/globals';

describe('Parser', () => {
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

	describe('Root node with property with value', () => {
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
			const values = property.values;
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

			expect(values?.values.length).toBe(1);
			const value = values?.values[0] ?? null;

			expect(value).toBeDefined();
			expect(value?.value instanceof NumberValues).toBeTruthy();
			const numberValue = value?.value as NumberValues;

			expect(numberValue.values[0].value).toBe(10);
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

		test('mising value ', async () => {
			const rootNode = '/{ \nprop1= < >;\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);

			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual(
				expect.arrayContaining([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH])
			);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

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
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values?.tokenIndexes?.end?.pos).toEqual({
				col: 9,
				len: 1,
				line: 1,
			});

			expect(values?.values.length).toBe(1);
			const value = values?.values[0] ?? null;

			expect(value).toBeDefined();
			expect(value?.value).toBeNull();

			// ------------ value end -----------

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 10,
				len: 1,
				line: 1,
			});
			// ---- property end ----
		});

		test('mising value and end > and semicoloun ', async () => {
			const rootNode = '/{ \nprop1= < \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);

			expect(parser.issues.length).toEqual(3);
			expect(parser.issues[0].issues).toEqual(
				expect.arrayContaining([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH])
			);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[1].issues).toEqual(expect.arrayContaining([Issues.GT_SYM]));
			expect(parser.issues[1].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[2].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[2].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

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
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values?.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});

			expect(values?.values.length).toBe(1);
			const value = values?.values[0] ?? null;

			expect(value).toBeDefined();
			expect(value?.value).toBeNull();

			// ------------ value end -----------

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LT_SYM])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			// ---- property end ----
		});

		test('mising value and end > and semicoloun + node end', async () => {
			const rootNode = '/{ \nprop1= <';
			const parser = new Parser(new Lexer(rootNode).tokens);

			expect(parser.issues.length).toEqual(5);
			expect(parser.issues[0].issues).toEqual(
				expect.arrayContaining([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH])
			);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[1].issues).toEqual(expect.arrayContaining([Issues.GT_SYM]));
			expect(parser.issues[1].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[2].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[2].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[3].issues).toEqual(expect.arrayContaining([Issues.CURLY_CLOSE]));
			expect(parser.issues[3].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[4].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[4].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];

			expect(node.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LT_SYM])
			);
			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
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
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values?.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});

			expect(values?.values.length).toBe(1);
			const value = values?.values[0] ?? null;

			expect(value).toBeDefined();
			expect(value?.value).toBeNull();

			// ------------ value end -----------

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LT_SYM])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			// ---- property end ----
		});

		test('mising value and end > and semicoloun + node end', async () => {
			const rootNode = '/{ \nprop1= < prop2= <';
			const parser = new Parser(new Lexer(rootNode).tokens);

			expect(parser.issues.length).toEqual(8);
			expect(parser.issues[0].issues).toEqual(
				expect.arrayContaining([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH])
			);
			expect(parser.issues[0].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[1].issues).toEqual(expect.arrayContaining([Issues.GT_SYM]));
			expect(parser.issues[1].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[2].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[2].token?.pos).toEqual({ len: 1, line: 1, col: 7 });

			expect(parser.issues[3].issues).toEqual(
				expect.arrayContaining([Issues.NUMERIC_VALUE, Issues.NODE_REF, Issues.NODE_PATH])
			);
			expect(parser.issues[3].token?.pos).toEqual({ len: 1, line: 1, col: 16 });

			expect(parser.issues[4].issues).toEqual(expect.arrayContaining([Issues.GT_SYM]));
			expect(parser.issues[4].token?.pos).toEqual({ len: 1, line: 1, col: 16 });

			expect(parser.issues[5].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[5].token?.pos).toEqual({ len: 1, line: 1, col: 16 });

			expect(parser.issues[6].issues).toEqual(expect.arrayContaining([Issues.CURLY_CLOSE]));
			expect(parser.issues[6].token?.pos).toEqual({ len: 1, line: 1, col: 16 });

			expect(parser.issues[7].issues).toEqual(
				expect.arrayContaining([Issues.END_STATMENT])
			);
			expect(parser.issues[7].token?.pos).toEqual({ len: 1, line: 1, col: 16 });

			expect(parser.document.nodes.length).toEqual(1);
			const node = parser.document.nodes[0];

			expect(node.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LT_SYM])
			);
			expect(node.tokenIndexes?.end?.pos).toEqual({
				col: 16,
				len: 1,
				line: 1,
			});

			// ---- property ----
			expect(node.properties.length).toEqual(2);
			const property1 = node.properties[0];

			expect(property1.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property1.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			// ------------ value -----------
			const values1 = property1.values;
			expect(values1?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values1?.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});

			expect(values1?.values.length).toBe(1);
			const valu1 = values1?.values[0] ?? null;

			expect(valu1).toBeDefined();
			expect(valu1?.value).toBeNull();

			// ------------ value end -----------

			const property2 = node.properties[0];

			expect(property2.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property2.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 5,
				line: 1,
			});

			// ------------ value -----------
			const values2 = property2.values;
			expect(values2?.tokenIndexes?.start?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			expect(values2?.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});

			expect(values2?.values.length).toBe(1);
			const value2 = values1?.values[0] ?? null;

			expect(value2).toBeDefined();
			expect(value2?.value).toBeNull();

			// ------------ value end -----------

			expect(property1.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LT_SYM])
			);
			expect(property1.tokenIndexes?.end?.pos).toEqual({
				col: 7,
				len: 1,
				line: 1,
			});
			// ---- property end ----
		});
	});

	describe('Dtc node', () => {
		test('named with no address', async () => {
			const rootNode = 'nodeName { \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const node = parser.document.nodes[0] as DtcNode;
			expect(node.labels.length).toEqual(0);
			expect(node.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName = node.nameOrRef as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 8,
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

		test('named with address complete', async () => {
			const rootNode = 'nodeName@200 { \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const node = parser.document.nodes[0] as DtcNode;
			expect(node.labels.length).toEqual(0);
			expect(node.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName = node.nameOrRef as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(nodeName.address).toBe(200);
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 12,
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

		test('named with address missing address number', async () => {
			const rootNode = 'nodeName@ { \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([Issues.NODE_ADDRESS]);
			expect(parser.issues[0].token?.pos).toEqual({ len: 9, line: 0, col: 0 });

			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const node = parser.document.nodes[0] as DtcNode;
			expect(node.labels.length).toEqual(0);
			expect(node.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName = node.nameOrRef as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(nodeName.address).toBeNaN();
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 9,
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

		test('named with multiple lables', async () => {
			const rootNode = 'label1: label2: nodeName { \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const node = parser.document.nodes[0] as DtcNode;
			expect(node.labels.length).toEqual(2);
			expect(node.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName = node.nameOrRef as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LABEL_ASSIGN])
			);

			expect(node.labels[0].label).toEqual('label1');
			expect(node.labels[0].tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 7,
				line: 0,
			});
			expect(node.labels[0].tokenIndexes?.start?.pos).toEqual(
				node.labels[0].tokenIndexes?.end?.pos
			);

			expect(node.labels[1].label).toEqual('label2');
			expect(node.labels[1].tokenIndexes?.start?.pos).toEqual({
				col: 8,
				len: 7,
				line: 0,
			});
			expect(node.labels[1].tokenIndexes?.start).toEqual(node.labels[1].tokenIndexes?.end);

			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 7,
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

		test('referance node', async () => {
			const rootNode = '&nodeRef { \n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const node = parser.document.nodes[0] as DtcNode;
			expect(node.labels.length).toEqual(0);
			expect(node.nameOrRef instanceof LabelRef).toBeTruthy();
			const nodeName = node.nameOrRef as LabelRef;

			expect(nodeName.ref).toBe('nodeRef');
			expect(nodeName.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.AMPERSAND])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(nodeName.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LABEL_NAME])
			);
			expect(nodeName.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 7,
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
	});

	describe('Dtc nested node', () => {
		test('nested named nodes', async () => {
			const rootNode = 'nodeName1 { \nnodeName2 { \n};\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcNode).toBeTruthy();
			const topNode = parser.document.nodes[0] as DtcNode;
			expect(topNode.labels.length).toEqual(0);
			expect(topNode.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName1 = topNode.nameOrRef as NodeName;

			expect(nodeName1.name).toBe('nodeName1');
			expect(topNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(topNode.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 9,
				line: 0,
			});

			expect(topNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(topNode.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 3,
			});

			const childNode = topNode.nodes[0] as DtcNode;
			expect(topNode.nodes.length).toEqual(1);
			expect(childNode.labels.length).toEqual(0);
			expect(childNode.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName2 = childNode.nameOrRef as NodeName;

			expect(nodeName2.name).toBe('nodeName2');
			expect(childNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(childNode.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 9,
				line: 1,
			});

			expect(childNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(childNode.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 2,
			});
		});

		test('nested named nodes', async () => {
			const rootNode = '/ { \nnodeName2 { \n};\n};';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.document.nodes.length).toEqual(1);
			expect(parser.document.nodes[0] instanceof DtcRootNode).toBeTruthy();
			const topNode = parser.document.nodes[0] as DtcRootNode;

			expect(topNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(topNode.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(topNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(topNode.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 3,
			});

			const childNode = topNode.nodes[0] as DtcNode;
			expect(topNode.nodes.length).toEqual(1);
			expect(childNode.labels.length).toEqual(0);
			expect(childNode.nameOrRef instanceof NodeName).toBeTruthy();
			const nodeName2 = childNode.nameOrRef as NodeName;

			expect(nodeName2.name).toBe('nodeName2');
			expect(childNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(childNode.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 9,
				line: 1,
			});

			expect(childNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(childNode.tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 2,
			});
		});
	});

	describe('Properties assign with all types', () => {
		test('property with u32', async () => {
			const rootNode = 'prop=< 10 >;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 11,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 1, col: 10, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof NumberValues).toBeTruthy();
			const value = values?.values[0]?.value as NumberValues;

			expect(value.values.length).toBe(1);

			expect(value.values[0].value).toBe(10);
			expect(value.values[0].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(value.values[0].tokenIndexes?.start?.pos).toStrictEqual(
				value.values[0].tokenIndexes?.end?.pos
			);
		});

		test('property with u64', async () => {
			const rootNode = 'prop=< 10 20 >;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 14,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const propertyValues = property.values;
			expect(propertyValues?.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 5,
				line: 0,
			});
			expect(propertyValues?.tokenIndexes?.end?.pos).toStrictEqual({
				len: 1,
				col: 13,
				line: 0,
			});

			expect(propertyValues?.values.length).toBe(1);

			expect(propertyValues?.values[0]?.value instanceof NumberValues).toBeTruthy();
			const numberValues = propertyValues?.values[0]?.value as NumberValues;

			expect(numberValues.values.length).toBe(2);

			expect(numberValues.values[0].value).toBe(10);
			expect(numberValues.values[0].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValues.values[0].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues.values[0].tokenIndexes?.end?.pos
			);

			expect(numberValues.values[1].value).toBe(20);
			expect(numberValues.values[1].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 10,
				line: 0,
			});
			expect(numberValues.values[1].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues.values[1].tokenIndexes?.end?.pos
			);
		});

		test('property with prop encoded array', async () => {
			const rootNode = 'prop=< 10 20 30 >;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 17,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const propertyValues = property.values;
			expect(propertyValues?.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 5,
				line: 0,
			});
			expect(propertyValues?.tokenIndexes?.end?.pos).toStrictEqual({
				len: 1,
				col: 16,
				line: 0,
			});

			expect(propertyValues?.values.length).toBe(1);

			expect(propertyValues?.values[0]?.value instanceof NumberValues).toBeTruthy();
			const numberValues = propertyValues?.values[0]?.value as NumberValues;

			expect(numberValues.values.length).toBe(3);

			expect(numberValues.values[0].value).toBe(10);
			expect(numberValues.values[0].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValues.values[0].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues.values[0].tokenIndexes?.end?.pos
			);

			expect(numberValues.values[1].value).toBe(20);
			expect(numberValues.values[1].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 10,
				line: 0,
			});
			expect(numberValues.values[1].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues.values[1].tokenIndexes?.end?.pos
			);

			expect(numberValues.values[2].value).toBe(30);
			expect(numberValues.values[2].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 13,
				line: 0,
			});
			expect(numberValues.values[2].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues.values[2].tokenIndexes?.end?.pos
			);
		});

		test('property with multiple u32', async () => {
			const rootNode = 'prop=< 10 >,< 20 >;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 18,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const propertyValues = property.values;
			expect(propertyValues?.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 5,
				line: 0,
			});
			expect(propertyValues?.tokenIndexes?.end?.pos).toStrictEqual({
				len: 1,
				col: 17,
				line: 0,
			});

			expect(propertyValues?.values.length).toBe(2);
			expect(propertyValues?.values[0]?.value instanceof NumberValues).toBeTruthy();
			const numberValues1 = propertyValues?.values[0]?.value as NumberValues;

			expect(numberValues1.values.length).toBe(1);

			expect(numberValues1.values[0].value).toBe(10);
			expect(numberValues1.values[0].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValues1.values[0].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues1.values[0].tokenIndexes?.end?.pos
			);

			const numberValues2 = propertyValues?.values[1]?.value as NumberValues;

			expect(numberValues2.values.length).toBe(1);

			expect(numberValues2.values[0].value).toBe(20);
			expect(numberValues2.values[0].tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 14,
				line: 0,
			});
			expect(numberValues2.values[0].tokenIndexes?.start?.pos).toStrictEqual(
				numberValues2.values[0].tokenIndexes?.end?.pos
			);
		});

		test('property with label ref', async () => {
			const rootNode = 'prop=< &nodeLabel >;';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 19,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 1, col: 18, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof LabelRefValue).toBeTruthy();
			const labelRef = values?.values[0]?.value as LabelRefValue;

			expect(labelRef.value).toBe('nodeLabel');
			expect(labelRef.labels.length).toBe(0);

			expect(labelRef.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 7,
				line: 0,
			});
			expect(labelRef.tokenIndexes?.end?.pos).toStrictEqual({
				len: 9,
				col: 8,
				line: 0,
			});
		});

		test('property with byte string', async () => {
			const rootNode = 'prop=[ 10 20 30 ];';
			const parser = new Parser(new Lexer(rootNode).tokens);
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledNode.properties.length).toEqual(1);
			const property = parser.unhandledNode.properties[0];

			expect(property.name).toBe('prop');
			expect(property.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property.tokenIndexes?.end?.pos).toEqual({
				col: 17,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 1, col: 16, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof ByteStringValue).toBeTruthy();
			const numberValues = values?.values[0]?.value as ByteStringValue;

			expect(numberValues.values.length).toBe(3);
			expect(numberValues.values.map((v) => v?.value)).toStrictEqual([10, 20, 30]);

			expect(numberValues.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValues.tokenIndexes?.end?.pos).toStrictEqual({
				len: 2,
				col: 13,
				line: 0,
			});
		});
	});
});
