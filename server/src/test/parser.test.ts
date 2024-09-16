/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Lexer } from '../lexer';
import { Parser } from '../parser';
import { SyntaxIssue, LexerToken } from '../types';
import { DtcChildNode, DtcRootNode, DtcRefNode, NodeName } from '../ast/dtc/node';
import { StringValue } from '../ast/dtc/values/string';
import { ByteStringValue } from '../ast/dtc/values/byteString';
import { LabelRef } from '../ast/dtc/labelRef';

import { describe, test, expect } from '@jest/globals';
import { ArrayValues } from '../ast/dtc/values/arrayValue';
import { NumberValue } from '../ast/dtc/values/number';
import { NodePathRef } from '../ast/dtc/values/nodePath';

describe('Parser', () => {
	describe('Empty root node', () => {
		test('Complete', async () => {
			const rootNode = '/{ \n};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0];
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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				col: 0,
				line: 1,
			});
			expect(parser.issues[0].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 1,
				col: 0,
				line: 1,
			});

			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_CLOSE])
			);
			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly only', async () => {
			const rootNode = '/{ \n;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				col: 0,
				line: 0,
			});
			expect(parser.issues[0].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 1,
				col: 0,
				line: 1,
			});

			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 0,
				len: 1,
				line: 1,
			});
		});

		test('Missing close curly and semicolon', async () => {
			const rootNode = '/{ \n';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(2);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				col: 0,
				line: 0,
			});
			expect(parser.issues[0].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 1,
				col: 1,
				line: 0,
			});
			expect(parser.issues[1].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				col: 1,
				line: 0,
			});
			expect(parser.issues[1].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 1,
				col: 1,
				line: 0,
			});

			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.CURLY_OPEN])
			);
			expect(parser.rootDocument.nodes[0].tokenIndexes?.end?.pos).toEqual({
				col: 1,
				len: 1,
				line: 0,
			});
		});
	});

	describe('Root node with property no value', () => {
		test('Complete', async () => {
			const rootNode = '/{ \nprop1;\n};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});

			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(3);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});
			expect(parser.issues[1].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
			expect(parser.issues[1].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				col: 0,
				line: 0,
			});
			expect(parser.issues[1].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});

			expect(parser.issues[2].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 5,
				col: 0,
				line: 1,
			});
			expect(parser.issues[2].astElement.tokenIndexes?.end?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});

			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			expect(value?.value instanceof ArrayValues).toBeTruthy();
			const arrayValues = value?.value as ArrayValues;
			expect(arrayValues.values[0].value instanceof NumberValue).toBeTruthy();
			const numberValue = arrayValues.values[0].value as NumberValue;

			expect(numberValue.value).toBe(10);
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
			const parser = new Parser(new Lexer(rootNode).tokens, '');

			expect(parser.issues.length).toEqual(0);

			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			expect(value?.value instanceof ArrayValues).toBeTruthy();
			expect((value?.value as ArrayValues).values.length).toBe(0);

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');

			expect(parser.issues.length).toEqual(2);

			expect(parser.issues[0].issues).toEqual(expect.arrayContaining([SyntaxIssue.GT_SYM]));
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});

			expect(parser.issues[1].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[1].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				line: 1,
				col: 7,
			});

			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			expect(value?.value instanceof ArrayValues).toBeTruthy();
			expect((value?.value as ArrayValues).values.length).toBe(0);

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');

			expect(parser.issues.length).toEqual(4);

			expect(parser.issues[0].issues).toEqual(expect.arrayContaining([SyntaxIssue.GT_SYM]));
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 5,
				line: 1,
				col: 0,
			});

			expect(parser.issues[1].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[1].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				line: 1,
				col: 7,
			});

			expect(parser.issues[2].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.CURLY_CLOSE])
			);
			expect(parser.issues[2].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				line: 0,
				col: 0,
			});

			expect(parser.issues[3].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[3].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 1,
				line: 1,
				col: 7,
			});

			expect(parser.rootDocument.nodes.length).toEqual(1);
			const node = parser.rootDocument.nodes[0] as DtcRootNode;

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
			expect(value?.value instanceof ArrayValues).toBeTruthy();
			expect((value?.value as ArrayValues).values.length).toBe(0);

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
	});

	describe('Dtc node', () => {
		test('named with no address', async () => {
			const rootNode = '/{nodeName { \n};};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0].nodes[0] instanceof DtcChildNode).toBeTruthy();
			const node = parser.rootDocument.nodes[0].nodes[0] as DtcChildNode;
			expect(node.labels.length).toEqual(0);
			expect(node.name instanceof NodeName).toBeTruthy();
			const nodeName = node.name as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 2,
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
			const rootNode = '/{nodeName@200 { \n};};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0].nodes[0] instanceof DtcChildNode).toBeTruthy();
			const node = parser.rootDocument.nodes[0].nodes[0] as DtcChildNode;
			expect(node.labels.length).toEqual(0);
			expect(node.name instanceof NodeName).toBeTruthy();
			const nodeName = node.name as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(nodeName.address).toBe(200);
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 2,
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
			const rootNode = '/{nodeName@ { \n};};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_ADDRESS]);
			expect(parser.issues[0].astElement.tokenIndexes?.start?.pos).toEqual({
				len: 9,
				line: 0,
				col: 2,
			});

			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0].nodes[0] instanceof DtcChildNode).toBeTruthy();
			const node = parser.rootDocument.nodes[0].nodes[0] as DtcChildNode;
			expect(node.labels.length).toEqual(0);
			expect(node.name instanceof NodeName).toBeTruthy();
			const nodeName = node.name as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(nodeName.address).toBeNaN();
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.NODE_NAME])
			);
			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 2,
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
			const rootNode = '/{label1: label2: nodeName { \n};};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0].nodes[0] instanceof DtcChildNode).toBeTruthy();
			const node = parser.rootDocument.nodes[0].nodes[0] as DtcChildNode;
			expect(node.labels.length).toEqual(2);
			expect(node.name instanceof NodeName).toBeTruthy();
			const nodeName = node.name as NodeName;

			expect(nodeName.name).toBe('nodeName');
			expect(node.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.LABEL_ASSIGN])
			);

			expect(node.labels[0].label).toEqual('label1');
			expect(node.labels[0].tokenIndexes?.start?.pos).toEqual({
				col: 2,
				len: 7,
				line: 0,
			});
			expect(node.labels[0].tokenIndexes?.start?.pos).toEqual(
				node.labels[0].tokenIndexes?.end?.pos
			);

			expect(node.labels[1].label).toEqual('label2');
			expect(node.labels[1].tokenIndexes?.start?.pos).toEqual({
				col: 10,
				len: 7,
				line: 0,
			});
			expect(node.labels[1].tokenIndexes?.start).toEqual(node.labels[1].tokenIndexes?.end);

			expect(node.tokenIndexes?.start?.pos).toEqual({
				col: 2,
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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0] instanceof DtcRefNode).toBeTruthy();
			const node = parser.rootDocument.nodes[0] as DtcRefNode;
			expect(node.labels.length).toEqual(0);
			expect(node.labelReferance instanceof LabelRef).toBeTruthy();
			const nodeName = node.labelReferance as LabelRef;

			expect(nodeName.value).toBe('nodeRef');
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
			const rootNode = '&nodeName { \nnodeName2 { \n};\n};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0] instanceof DtcRefNode).toBeTruthy();
			const topNode = parser.rootDocument.nodes[0] as DtcRefNode;
			expect(topNode.labels.length).toEqual(0);
			const nodeName1 = topNode.labelReferance as LabelRef;

			expect(nodeName1.label?.value).toBe('nodeName');
			expect(topNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.AMPERSAND])
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

			const childNode = topNode.nodes[0] as DtcChildNode;
			expect(topNode.nodes.length).toEqual(1);
			expect(childNode.labels.length).toEqual(0);
			expect(childNode.name instanceof NodeName).toBeTruthy();
			const nodeName2 = childNode.name as NodeName;

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes.length).toEqual(1);
			expect(parser.rootDocument.nodes[0] instanceof DtcRootNode).toBeTruthy();
			const topNode = parser.rootDocument.nodes[0] as DtcRootNode;

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

			const childNode = topNode.nodes[0] as DtcChildNode;
			expect(topNode.nodes.length).toEqual(1);
			expect(childNode.labels.length).toEqual(0);
			expect(childNode.name instanceof NodeName).toBeTruthy();
			const nodeName2 = childNode.name as NodeName;

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
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
			expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValues = values?.values[0]?.value as ArrayValues;
			expect(arrayValues.values[0].value instanceof NumberValue).toBeTruthy();
			const value = arrayValues.values[0].value as NumberValue;

			expect(arrayValues.values.length).toBe(1);

			expect(value.value).toBe(10);
			expect(value.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(value.tokenIndexes?.start?.pos).toStrictEqual(value.tokenIndexes?.end?.pos);
		});

		test('property missing next value', async () => {
			const rootNode = 'prop=< 10 >,;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
				col: 12,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 1, col: 11, line: 0 });

			expect(values?.values.length).toBe(2);

			expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValues = values?.values[0]?.value as ArrayValues;
			expect(arrayValues.values[0].value instanceof NumberValue).toBeTruthy();
			const value = arrayValues.values[0].value as NumberValue;

			expect(values?.values.length).toBe(2);

			expect(value.value).toBe(10);
			expect(value.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(value.tokenIndexes?.start?.pos).toStrictEqual(value.tokenIndexes?.end?.pos);

			expect(values?.values[1]).toBeNull();
		});

		test('property missing value between', async () => {
			const rootNode = 'prop=< 10 >,,< 10 >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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

			expect(values?.values.length).toBe(3);

			expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = values?.values[0]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof NumberValue).toBeTruthy();
			const value1 = arrayValue1.values[0].value as NumberValue;

			expect(arrayValue1.values.length).toBe(1);

			expect(value1.value).toBe(10);
			expect(value1.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(value1.tokenIndexes?.start?.pos).toStrictEqual(value1.tokenIndexes?.end?.pos);

			expect(values?.values[1]).toBeNull();

			expect(values?.values[2]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue3 = values?.values[2]?.value as ArrayValues;
			expect(arrayValue3.values[0].value instanceof NumberValue).toBeTruthy();
			const value3 = arrayValue3.values[0].value as NumberValue;

			expect(value3.value).toBe(10);
			expect(value3.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 15,
				line: 0,
			});
			expect(value3.tokenIndexes?.start?.pos).toStrictEqual(value3.tokenIndexes?.end?.pos);
		});

		test('property with u64', async () => {
			const rootNode = 'prop=< 10 20 >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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

			expect(propertyValues?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = propertyValues?.values[0]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof NumberValue).toBeTruthy();
			expect(arrayValue1.values[1].value instanceof NumberValue).toBeTruthy();
			const numberValue1 = arrayValue1.values[0].value as NumberValue;
			const numberValue2 = arrayValue1.values[1].value as NumberValue;

			expect(arrayValue1.values.length).toBe(2);

			expect(numberValue1.value).toBe(10);
			expect(numberValue1.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValue1.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue1.tokenIndexes?.end?.pos
			);

			expect(numberValue2.value).toBe(20);
			expect(numberValue2.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 10,
				line: 0,
			});
			expect(numberValue2.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue2.tokenIndexes?.end?.pos
			);
		});

		test('property with prop encoded array', async () => {
			const rootNode = 'prop=< 10 20 30 >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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

			expect(propertyValues?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = propertyValues?.values[0]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof NumberValue).toBeTruthy();
			expect(arrayValue1.values[1].value instanceof NumberValue).toBeTruthy();
			expect(arrayValue1.values[2].value instanceof NumberValue).toBeTruthy();
			const numberValue1 = arrayValue1.values[0].value as NumberValue;
			const numberValue2 = arrayValue1.values[1].value as NumberValue;
			const numberValue3 = arrayValue1.values[2].value as NumberValue;

			expect(arrayValue1.values.length).toBe(3);

			expect(numberValue1.value).toBe(10);
			expect(numberValue1.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 7,
				line: 0,
			});
			expect(numberValue1.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue1.tokenIndexes?.end?.pos
			);

			expect(numberValue2.value).toBe(20);
			expect(numberValue2.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 10,
				line: 0,
			});
			expect(numberValue2.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue2.tokenIndexes?.end?.pos
			);

			expect(numberValue3.value).toBe(30);
			expect(numberValue3.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 13,
				line: 0,
			});
			expect(numberValue3.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue3.tokenIndexes?.end?.pos
			);
		});

		test('property with multiple values', async () => {
			const rootNode = 'prop="test",,< 20 >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
			const propertyValues = property.values;
			expect(propertyValues?.tokenIndexes?.start?.pos).toStrictEqual({
				len: 6,
				col: 5,
				line: 0,
			});
			expect(propertyValues?.tokenIndexes?.end?.pos).toStrictEqual({
				len: 1,
				col: 18,
				line: 0,
			});

			expect(propertyValues?.values.length).toBe(3);
			expect(propertyValues?.values[0]?.value instanceof StringValue).toBeTruthy();
			const numberValues1 = propertyValues?.values[0]?.value as StringValue;

			expect(numberValues1.value).toBe('"test"');
			expect(numberValues1.tokenIndexes?.start?.pos).toStrictEqual({
				len: 6,
				col: 5,
				line: 0,
			});
			expect(numberValues1.tokenIndexes?.start?.pos).toStrictEqual(
				numberValues1.tokenIndexes?.end?.pos
			);

			expect(propertyValues?.values[1]).toBeNull();

			expect(propertyValues?.values[2]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = propertyValues?.values[2]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof NumberValue).toBeTruthy();
			const numberValue3 = arrayValue1.values[0].value as NumberValue;

			expect(arrayValue1.values.length).toBe(1);

			expect(numberValue3.value).toBe(20);
			expect(numberValue3.tokenIndexes?.start?.pos).toStrictEqual({
				len: 2,
				col: 15,
				line: 0,
			});
			expect(numberValue3.tokenIndexes?.start?.pos).toStrictEqual(
				numberValue3.tokenIndexes?.end?.pos
			);
		});

		test('property with cell array label ref', async () => {
			const rootNode = 'prop=< &nodeLabel >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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

			expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = values?.values[0]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof LabelRef).toBeTruthy();
			const labelRef = arrayValue1.values[0].value as LabelRef;

			expect(labelRef.value).toBe('nodeLabel');
			expect(arrayValue1.values[0].labels.length).toBe(0);

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

		test('property with label ref', async () => {
			const rootNode = 'prop=&nodeLabel;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
				col: 15,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 9, col: 6, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof LabelRef).toBeTruthy();
			const labelRef = values?.values[0]?.value as LabelRef;

			expect(labelRef.label?.value).toBe('nodeLabel');

			expect(labelRef.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 5,
				line: 0,
			});
			expect(labelRef.tokenIndexes?.end?.pos).toStrictEqual({
				len: 9,
				col: 6,
				line: 0,
			});
		});

		test('property with node path', async () => {
			const rootNode = 'prop=< &{/node1@/node2@20/node3} >;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(1); // -> node1@ node address
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
				col: 34,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 1, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 1, col: 33, line: 0 });

			expect(values?.values.length).toBe(1);

			expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
			const arrayValue1 = values?.values[0]?.value as ArrayValues;
			expect(arrayValue1.values[0].value instanceof NodePathRef).toBeTruthy();
			const nodePathValue = arrayValue1.values[0].value as NodePathRef;

			expect(nodePathValue.path?.pathParts.map((p) => p?.name)).toStrictEqual([
				'node1',
				'node2',
				'node3',
			]);
			expect(nodePathValue.path?.pathParts.map((p) => p?.address)).toStrictEqual([
				NaN,
				20,
				undefined,
			]);
			expect(arrayValue1.values[0].labels.length).toBe(0);

			expect(nodePathValue.tokenIndexes?.start?.pos).toStrictEqual({
				len: 1,
				col: 7,
				line: 0,
			});
			expect(nodePathValue.tokenIndexes?.end?.pos).toStrictEqual({
				len: 1,
				col: 31,
				line: 0,
			});
		});

		test('property with byte string', async () => {
			const rootNode = 'prop=[ 10 20 30 ];';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
			expect(numberValues.values.map((v) => v?.value?.value)).toStrictEqual([10, 20, 30]);

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

		test('property with string same line', async () => {
			const rootNode = 'prop="--\\"hello word;\\"--";';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
				col: 28,
				len: 1,
				line: 0,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof StringValue).toBeTruthy();
			const stringValue = values?.values[0]?.value as StringValue;

			expect(stringValue.value).toBe('"--\\"hello word;\\"--"');

			expect(stringValue.tokenIndexes?.start?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 0,
			});
			expect(stringValue.tokenIndexes?.end?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 0,
			});
		});

		test('property with two strings two lines', async () => {
			const rootNode = 'prop="--\\"hello word;\\"--";\nprop="--\\"hello word;\\"--";';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(2);
			const property1 = parser.unhandledStaments.properties[0];

			expect(property1.propertyName?.name).toBe('prop');
			expect(property1.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property1.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 0,
			});

			expect(property1.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property1.tokenIndexes?.end?.pos).toEqual({
				col: 28,
				len: 1,
				line: 0,
			});

			expect(property1.values).toBeDefined();
			const values1 = property1.values;
			expect(values1?.tokenIndexes?.start?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });
			expect(values1?.tokenIndexes?.end?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });

			expect(values1?.values.length).toBe(1);
			expect(values1?.values[0]?.value instanceof StringValue).toBeTruthy();
			const stringValue1 = values1?.values[0]?.value as StringValue;

			expect(stringValue1.value).toBe('"--\\"hello word;\\"--"');

			expect(stringValue1.tokenIndexes?.start?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 0,
			});
			expect(stringValue1.tokenIndexes?.end?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 0,
			});

			const property2 = parser.unhandledStaments.properties[1];

			expect(property2.propertyName?.name).toBe('prop');
			expect(property2.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.PROPERTY_NAME])
			);
			expect(property2.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 4,
				line: 1,
			});

			expect(property2.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(property2.tokenIndexes?.end?.pos).toEqual({
				col: 28,
				len: 1,
				line: 1,
			});

			expect(property2.values).toBeDefined();
			const values2 = property2.values;
			expect(values2?.tokenIndexes?.start?.pos).toStrictEqual({ len: 23, col: 5, line: 1 });
			expect(values2?.tokenIndexes?.end?.pos).toStrictEqual({ len: 23, col: 5, line: 1 });

			expect(values1?.values.length).toBe(1);
			expect(values1?.values[0]?.value instanceof StringValue).toBeTruthy();
			const stringValue2 = values2?.values[0]?.value as StringValue;

			expect(stringValue2.value).toBe('"--\\"hello word;\\"--"');

			expect(stringValue2.tokenIndexes?.start?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 1,
			});
			expect(stringValue2.tokenIndexes?.end?.pos).toStrictEqual({
				len: 23,
				col: 5,
				line: 1,
			});
		});

		test('property with string multi line', async () => {
			const rootNode = 'prop="--\\"hello\n word;\\"--";';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.properties.length).toEqual(1);
			const property = parser.unhandledStaments.properties[0];

			expect(property.propertyName?.name).toBe('prop');
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
				col: 12,
				len: 1,
				line: 1,
			});

			expect(property.values).toBeDefined();
			const values = property.values;
			expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 24, col: 5, line: 0 });
			expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 24, col: 5, line: 0 });

			expect(values?.values.length).toBe(1);
			expect(values?.values[0]?.value instanceof StringValue).toBeTruthy();
			const stringValue = values?.values[0]?.value as StringValue;

			expect(stringValue.value).toBe('"--\\"hello\n word;\\"--"');

			expect(stringValue.tokenIndexes?.start?.pos).toStrictEqual({
				len: 24,
				col: 5,
				line: 0,
			});
			expect(stringValue.tokenIndexes?.end?.pos).toStrictEqual({
				len: 24,
				col: 5,
				line: 0,
			});
		});
	});

	test('property with string missing closing "', async () => {
		const rootNode = 'prop="--\\"hello word;\\"--;';
		const parser = new Parser(new Lexer(rootNode).tokens, '');
		expect(parser.issues.length).toEqual(2);
		expect(parser.issues[0].issues).toEqual(
			expect.arrayContaining([SyntaxIssue.DUOUBE_QUOTE])
		);
		expect(parser.issues[1].issues).toEqual(
			expect.arrayContaining([SyntaxIssue.END_STATMENT])
		);
		expect(parser.unhandledStaments.properties.length).toEqual(1);
		const property = parser.unhandledStaments.properties[0];

		expect(property.propertyName?.name).toBe('prop');
		expect(property.tokenIndexes?.start?.tokens).toEqual(
			expect.arrayContaining([LexerToken.PROPERTY_NAME])
		);
		expect(property.tokenIndexes?.start?.pos).toEqual({
			col: 0,
			len: 4,
			line: 0,
		});

		expect(property.tokenIndexes?.end?.tokens).toEqual(
			expect.arrayContaining([LexerToken.STRING])
		);
		expect(property.tokenIndexes?.end?.pos).toEqual({
			col: 5,
			len: 23,
			line: 0,
		});

		expect(property.values).toBeDefined();
		const values = property.values;
		expect(values?.tokenIndexes?.start?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });
		expect(values?.tokenIndexes?.end?.pos).toStrictEqual({ len: 23, col: 5, line: 0 });

		expect(values?.values.length).toBe(1);
		expect(values?.values[0]?.value instanceof StringValue).toBeTruthy();
		const stringValue = values?.values[0]?.value as StringValue;

		expect(stringValue.value).toBe('"--\\"hello word;\\"--;');

		expect(stringValue.tokenIndexes?.start?.pos).toStrictEqual({
			len: 23,
			col: 5,
			line: 0,
		});
		expect(stringValue.tokenIndexes?.end?.pos).toStrictEqual({
			len: 23,
			col: 5,
			line: 0,
		});
	});

	describe('Delete', () => {
		test('delete node name', async () => {
			const rootNode = '/{/delete-node/ nodeName@400;};';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.nodes[0].deleteNodes.length).toEqual(1);
			const deleteNode = parser.rootDocument.nodes[0].deleteNodes[0];

			expect(deleteNode.nodeNameOrRef instanceof NodeName).toBeTruthy();
			const nodeName = deleteNode.nodeNameOrRef as NodeName;
			expect(nodeName.name).toBe('nodeName');
			expect(nodeName.address).toBe(400);

			expect(deleteNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(deleteNode.tokenIndexes?.start?.pos).toEqual({
				col: 2,
				len: 1,
				line: 0,
			});

			expect(deleteNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(deleteNode.tokenIndexes?.end?.pos).toEqual({
				col: 28,
				len: 1,
				line: 0,
			});
		});

		test('delete node ref', async () => {
			const rootNode = '/delete-node/ &ref;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.rootDocument.deleteNodes.length).toEqual(1);
			const deleteNode = parser.rootDocument.deleteNodes[0];

			expect(deleteNode.nodeNameOrRef instanceof LabelRef).toBeTruthy();
			const labelRefValue = deleteNode.nodeNameOrRef as LabelRef;
			expect(labelRefValue.label?.value).toBe('ref');

			expect(deleteNode.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(deleteNode.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(deleteNode.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(deleteNode.tokenIndexes?.end?.pos).toEqual({
				col: 18,
				len: 1,
				line: 0,
			});
		});

		test('delete property', async () => {
			const rootNode = '/delete-property/ prop1;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.deleteProperties.length).toEqual(1);
			const deleteProperty = parser.unhandledStaments.deleteProperties[0];

			expect(deleteProperty.propertyName?.name).toBe('prop1');

			expect(deleteProperty.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(deleteProperty.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(deleteProperty.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(deleteProperty.tokenIndexes?.end?.pos).toEqual({
				col: 23,
				len: 1,
				line: 0,
			});
		});

		test('delete , as property', async () => {
			const rootNode = '/delete-property/ ,;';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(0);
			expect(parser.unhandledStaments.deleteProperties.length).toEqual(1);
			const deleteProperty = parser.unhandledStaments.deleteProperties[0];

			expect(deleteProperty.propertyName?.name).toBe(',');

			expect(deleteProperty.tokenIndexes?.start?.tokens).toEqual(
				expect.arrayContaining([LexerToken.FORWARD_SLASH])
			);
			expect(deleteProperty.tokenIndexes?.start?.pos).toEqual({
				col: 0,
				len: 1,
				line: 0,
			});

			expect(deleteProperty.tokenIndexes?.end?.tokens).toEqual(
				expect.arrayContaining([LexerToken.SEMICOLON])
			);
			expect(deleteProperty.tokenIndexes?.end?.pos).toEqual({
				col: 19,
				len: 1,
				line: 0,
			});
		});
	});

	describe('Unknown syntax', () => {
		test('garbage', async () => {
			const rootNode = 'fsfsd $ % ^ @ __ ++ =  "dsfsdf" " fdfsdfdfsd"';
			const parser = new Parser(new Lexer(rootNode).tokens, '');
			expect(parser.issues.length).toEqual(8);

			expect(parser.issues[0].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[1].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.UNKNOWN])
			);
			expect(parser.issues[2].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.UNKNOWN])
			);
			expect(parser.issues[3].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.UNKNOWN])
			);
			expect(parser.issues[4].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.UNKNOWN])
			);
			expect(parser.issues[5].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[6].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.END_STATMENT])
			);
			expect(parser.issues[7].issues).toEqual(
				expect.arrayContaining([SyntaxIssue.UNKNOWN])
			);
		});
	});
});
