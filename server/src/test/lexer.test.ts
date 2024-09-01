/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Lexer, LexerToken, Token } from '../lexer';
import { describe, test, expect } from '@jest/globals';

describe('Lexer', () => {
	test('Label assign', async () => {
		const lexer = new Lexer('_simpleLabel09:');
		expect(lexer.tokens.length).toBe(1);
		const token: Token = {
			tokens: [LexerToken.LABEL_ASSIGN],
			pos: {
				line: 0,
				col: 0,
				len: '_simpleLabel09:'.length,
			},
			value: '_simpleLabel09',
		};
		expect(lexer.tokens).toEqual([token]);
	});

	test('Label Ref', async () => {
		const expected = '_simple_Label09';
		const lexer = new Lexer(`&${expected}`);
		expect(lexer.tokens.length).toBe(2);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.AMPERSAND]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: 1,
		});
		expect(lexer.tokens[1].tokens).toEqual(expect.arrayContaining([LexerToken.LABEL_NAME]));
		expect(lexer.tokens[1].value).toEqual(expected);
		expect(lexer.tokens[1].pos).toEqual({
			line: 0,
			col: 1,
			len: expected.length,
		});
	});

	test('Simple label ref', async () => {
		const value = 'simpleLabel';
		const lexer = new Lexer(`&${value}`);
		expect(lexer.tokens.length).toBe(2);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.AMPERSAND]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: 1,
		});
		expect(lexer.tokens[1].tokens).toEqual(expect.arrayContaining([LexerToken.LABEL_NAME]));
		expect(lexer.tokens[1].pos).toEqual({
			line: 0,
			col: 1,
			len: value.length,
		});
		expect(lexer.tokens[1].value).toEqual(value);
	});

	test('Node name with address', async () => {
		const value = 'myNodeName_.+-@100';
		const lexer = new Lexer(value);
		expect(lexer.tokens.length).toBe(1);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.NODE_NAME]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: value.length,
		});

		expect(lexer.tokens[0].value).toEqual(value);
	});

	test('Node name with no address', async () => {
		const value = 'myNodeName_.+-';
		const lexer = new Lexer(value);
		expect(lexer.tokens.length).toBe(1);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.NODE_NAME]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: value.length,
		});

		expect(lexer.tokens[0].value).toEqual(value);
	});

	test('Simple node name with address', async () => {
		const value = 'myNodeName@100';
		const lexer = new Lexer(value);
		expect(lexer.tokens.length).toBe(1);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.NODE_NAME]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: value.length,
		});

		expect(lexer.tokens[0].value).toEqual(value);
	});

	test('Simple node name with no address', async () => {
		const value = 'myNodeName';
		const lexer = new Lexer(value);
		expect(lexer.tokens.length).toBe(1);
		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.NODE_NAME]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: value.length,
		});

		expect(lexer.tokens[0].value).toEqual(value);
	});

	test('White space and position', async () => {
		const lexer = new Lexer('\n     \tsimpleLabel: \n ');
		expect(lexer.tokens.length).toBe(6);

		expect(lexer.tokens[0].tokens).toEqual(expect.arrayContaining([LexerToken.EOL]));
		expect(lexer.tokens[0].pos).toEqual({
			line: 0,
			col: 0,
			len: 1,
		});

		expect(lexer.tokens[1].tokens).toEqual(
			expect.arrayContaining([LexerToken.WHITE_SPACE])
		);
		expect(lexer.tokens[1].pos).toEqual({
			line: 1,
			col: 0,
			len: 6,
		});
		expect(lexer.tokens[1].value).toEqual('     \t');

		expect(lexer.tokens[2].tokens).toEqual(
			expect.arrayContaining([LexerToken.LABEL_ASSIGN])
		);
		expect(lexer.tokens[2].pos).toEqual({
			line: 1,
			col: 7,
			len: 'simpleLabel:'.length,
		});
		expect(lexer.tokens[2].value).toEqual('simpleLabel');

		expect(lexer.tokens[3].tokens).toEqual(
			expect.arrayContaining([LexerToken.WHITE_SPACE])
		);
		expect(lexer.tokens[3].pos).toEqual({
			line: 1,
			col: 19,
			len: 1,
		});
		expect(lexer.tokens[3].value).toEqual(' ');

		expect(lexer.tokens[4].tokens).toEqual(expect.arrayContaining([LexerToken.EOL]));
		expect(lexer.tokens[4].pos).toEqual({
			line: 1,
			col: 19,
			len: 1,
		});

		expect(lexer.tokens[5].tokens).toEqual(
			expect.arrayContaining([LexerToken.WHITE_SPACE])
		);
		expect(lexer.tokens[5].pos).toEqual({
			line: 2,
			col: 0,
			len: 1,
		});
		expect(lexer.tokens[5].value).toEqual(' ');
	});
});