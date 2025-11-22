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

import fs from 'fs';
import { fileURLToPath } from 'url';
import { describe, test, jest, expect, beforeEach } from '@jest/globals';
import {
	FormattingOptions,
	TextDocumentIdentifier,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { resetTokenizedDocumentProvider } from '../providers/tokenizedDocument';
import { ContextAware } from '../runtimeEvaluator';
import { formatText } from '../getDocumentFormatting';
import { filePathUri, getFakeBindingLoader } from './helpers';

jest.mock('fs', () => ({
	readFileSync: jest.fn().mockImplementation(() => {
		throw new Error('readFileSync - Not mocked');
	}),
	existsSync: jest.fn().mockImplementation(() => {
		return true;
	}),
}));

const mockReadFileSync = (content: string) => {
	(fs.readFileSync as unknown as jest.Mock).mockImplementation(() => {
		return content;
	});
};

const getEdits = async (
	document: TextDocument,
	options?: Partial<FormattingOptions>,
) => {
	mockReadFileSync(document.getText());
	const textDocument: TextDocumentIdentifier = {
		uri: document.uri,
	};
	const context = new ContextAware(
		{ dtsFile: fileURLToPath(textDocument.uri) },
		{
			...options,
			tabSize: 4,
			insertSpaces: false,
			trimTrailingWhitespace: true,
		},
		getFakeBindingLoader(),
	);
	await context.parser.stable;

	return formatText(
		{
			textDocument,
			options: {
				...options,
				tabSize: 4,
				insertSpaces: false,
				trimTrailingWhitespace: true,
			},
		},
		document.getText(),
		'New Text',
	);
};

const getNewText = async (
	documentText: string,
	options?: Partial<FormattingOptions>,
) => {
	// Create a text document
	const document = TextDocument.create(
		filePathUri,
		'devicetree',
		0,
		documentText,
	);

	return getEdits(document, options);
};

describe('Document formating', () => {
	beforeEach(() => {
		resetTokenizedDocumentProvider();
	});

	test('only insertFinalNewline', async () => {
		const documentText = '/{};';
		const newText = await getNewText(documentText, {
			insertFinalNewline: true,
			trimFinalNewlines: true,
		});
		expect(newText).toEqual('/ {};\n');
	});

	test('trimFinalNewlines', async () => {
		const documentText = '/{};\n\n\n';
		const newText = await getNewText(documentText, {
			insertFinalNewline: true,
			trimFinalNewlines: true,
		});
		expect(newText).toEqual('/ {};\n');
	});

	test('insertFinalNewline and trimFinalNewlines', async () => {
		const documentText = '/{};\n';
		const newText = await getNewText(documentText, {
			insertFinalNewline: true,
			trimFinalNewlines: true,
		});
		expect(newText).toEqual('/ {};\n');
	});

	test('No insertFinalNewline and trimFinalNewlines', async () => {
		const documentText = '/{};\n\n\n';
		const newText = await getNewText(documentText, {
			insertFinalNewline: false,
			trimFinalNewlines: false,
		});
		expect(newText).toEqual('/ {};\n\n\n');
	});

	describe('Root Node', () => {
		test('No space between / and {', async () => {
			const documentText = '/{};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});

		test('new line and tab state of doc', async () => {
			const documentText = `\n\tn1: node {\n\t\tprop1;\n\t\tprop2;\n\t};`;
			const newText = await getNewText(documentText);
			expect(newText).toEqual(`n1: node {\n\tprop1;\n\tprop2;\n};`);
		});

		test('Node extra new line from top', async () => {
			const documentText = '\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});

		test('Node two new line from top', async () => {
			const documentText = '\n\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});

		test('Node multiple new line from top', async () => {
			const documentText = '\n\n\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});

		test('Node no new line from other root', async () => {
			const documentText = '/ {};/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n/ {};');
		});

		test('Node multiple new line from other root', async () => {
			const documentText = '/ {};\n\n\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n/ {};');
		});

		test('Node empty new line from other root', async () => {
			const documentText = '/ {};\n\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n/ {};');
		});

		test('Closing } on same line empty node', async () => {
			const documentText = '/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});
		test('Closing } empty new line empty node', async () => {
			const documentText = '/ {\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});
		test('Closing } multiple new line empty node', async () => {
			const documentText = '/ {\n\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});

		test('Closing } on same line with property node', async () => {
			const documentText = '/ {\n\tprop;};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop;\n};');
		});
		test('Closing } empty new line empty node', async () => {
			const documentText = '/ {\n\tprop;\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop;\n};');
		});
		test('Closing } multiple new line empty node', async () => {
			const documentText = '/ {\n\tprop;\n\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop;\n};');
		});

		test('Single space before semicolon', async () => {
			const documentText = '/ {\n} ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});
		test('Multiple spaces before semicolon', async () => {
			const documentText = '/ {\n}   ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});
		test('Comment before ;', async () => {
			const documentText = '/ {\n} /* abc */  ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {}; /* abc */');
		});
		test('Comments before ;', async () => {
			const documentText = '/ {\n} /* abc1 */ /* abc2 */   ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {}; /* abc1 */ /* abc2 */');
		});
	});

	describe('Child node', () => {
		test('Labels no space', async () => {
			const documentText = '/ {\n\tn1:n2:n3:node {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tn1: n2: n3: node {};\n};');
		});
		test('Labels with new lines space', async () => {
			const documentText = '/ {\n\tn1:\nn2:\n\nn3:node {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tn1: n2: n3: node {};\n};');
		});
		test('labels with new line before name', async () => {
			const documentText = '/ {\n\tn1:\nnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tn1: node {};\n};');
		});
		test('No space between name and { no address', async () => {
			const documentText = '/ {\n\tnode{\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('No space between name and { with address', async () => {
			const documentText = '/ {\n\tnode@20{\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode@20 {};\n};');
		});

		test('Node address with unknown value', async () => {
			const documentText = '/{node1@FOO_BAR{};};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode1@FOO_BAR {};\n};');
		});

		test('Multiple space between name and { no address', async () => {
			const documentText = '/ {\n\tnode  {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('Multiple space between name and { with address', async () => {
			const documentText = '/ {\n\tnode@20  {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode@20 {};\n};');
		});

		test('Node no new line from top', async () => {
			const documentText = '/ {node {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('Node one new line from top', async () => {
			const documentText = '/ {\nnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('Node two new line from top', async () => {
			const documentText = '/ {\n\n\tnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('Node more then two new line from top', async () => {
			const documentText = '/ {\n\n\n\n\tnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});

		test('Node no new line from other Child', async () => {
			const documentText = '/ {\n\tnode1 {};node2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode1 {};\n\n\tnode2 {};\n};');
		});

		test('Node multiple new line from other Child', async () => {
			const documentText = '/ {\n\tnode {};\n\n\nnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n\n\tnode {};\n};');
		});

		test('Node empty new line from other Child', async () => {
			const documentText = '/ {\n\tnode {};\n\nnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n\n\tnode {};\n};');
		});

		test('Closing } on same line', async () => {
			const documentText = '/ {\n\tnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});
		test('Closing } empty new line', async () => {
			const documentText = '/ {\n\tnode {\n\n};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});
		test('Closing } multiple new line', async () => {
			const documentText = '/ {\n\tnode {\n\n\n};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});
		test('Single space before semicolon', async () => {
			const documentText = '/ {\n\tnode {} ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});
		test('Multiple spaces before semicolon', async () => {
			const documentText = '/ {\n\tnode {}    ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {};\n};');
		});
		test('Comment before ; - case 1', async () => {
			const documentText = '/ {\n\tnode {} /* abc */   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {}; /* abc */\n};');
		});
		test('Comments before ; - case 2', async () => {
			const documentText = '/ {\n\tnode {} /* abc1 */ /* abc2 */   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tnode {}; /* abc1 */ /* abc2 */\n};',
			);
		});

		test('Nodes with block comment ensure new line - case 1', async () => {
			const documentText =
				'/ {\n\n/* abc1 */\n\tnode1 {};\n/* abc2 */\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/* abc1 */\n\tnode1 {};\n\n\t/* abc2 */\n\tnode2 {};\n};',
			);
		});

		test('Nodes with block comment ensure new line - case 2', async () => {
			const documentText =
				'/ {\n\n/* abc1 */\n\tnode1 {};\n\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/* abc1 */\n\tnode1 {};\n\n\tnode2 {};\n};',
			);
		});

		test('Nodes with block comment ensure new line - case 3', async () => {
			const documentText = '/ {\n\n/* abc1 */\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/* abc1 */\n\tnode1 {};\n};');
		});

		test('Nodes with multiple block comments ensure new line', async () => {
			const documentText =
				'/ {\n\n/* abc1 */\n/* abc2 */\n\tnode1 {};\n/* abc3 */\n/* abc4 */\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/* abc1 */\n\t/* abc2 */\n\tnode1 {};\n\n\t/* abc3 */\n\t/* abc4 */\n\tnode2 {};\n};',
			);
		});

		test('Root Nodes with comment ensure new line', async () => {
			const documentText = '// abc1\n/ {};\n// abc2\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('// abc1\n/ {};\n\n// abc2\n/ {};');
		});

		test('Nodes with comment ensure new line - case 1', async () => {
			const documentText =
				'/ {\n\n// abc1\n\tnode1 {};\n// abc2\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t// abc1\n\tnode1 {};\n\n\t// abc2\n\tnode2 {};\n};',
			);
		});

		test('Nodes with comment ensure new line - case 2', async () => {
			const documentText = '/ {\n\n// abc1\n\tnode1 {};\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t// abc1\n\tnode1 {};\n\n\tnode2 {};\n};',
			);
		});

		test('Nodes with comment ensure new line - case 3', async () => {
			const documentText = '/ {\n\n// abc1\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t// abc1\n\tnode1 {};\n};');
		});

		test('Nodes with multiple comments ensure new line', async () => {
			const documentText =
				'/ {\n\tprop1;\n/* foo; */\n\n// abc1\n// abc2\n\tnode1 {};\n// abc3\n// abc4\n\tnode2 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1;\n\t/* foo; */\n\n\t// abc1\n\t// abc2\n\tnode1 {};\n\n\t// abc3\n\t// abc4\n\tnode2 {};\n};',
			);
		});

		test('Root Nodes with comment ensure new line', async () => {
			const documentText = '// abc1\n/ {};\n// abc2\n/ {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('// abc1\n/ {};\n\n// abc2\n/ {};');
		});

		test('Comment not linked to Node before node', async () => {
			const documentText = '/ {\n\tprop1;\n/* foo; */\n\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1;\n\t/* foo; */\n\n\tnode1 {};\n};',
			);
		});

		test('Comment linked to Node before node', async () => {
			const documentText =
				'/ {\n\tprop1;\n/* foo; */\n\t/* bar; */\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1;\n\n\t/* foo; */\n\t/* bar; */\n\tnode1 {};\n};',
			);
		});

		test('Comment not linked inside a if def', async () => {
			const documentText =
				'/ {\n#ifdef ABC\n/* foo; */\n#endif\n\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n#ifdef ABC\n\t/* foo; */\n#endif\n\n\tnode1 {};\n};',
			);
		});

		test('Comment not linked inside a disabed if def inside node', async () => {
			const documentText =
				'/ {\n#ifdef ABC\nnode {\n/* foo; */ };\n#endif\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n#ifdef ABC\n\tnode {\n\t\t/* foo; */\n\t};\n#endif\n\n\tnode1 {};\n};',
			);
		});
	});

	describe('Ref Node', () => {
		test('Labels no space', async () => {
			const documentText = 'n1:n2:n3:&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('n1: n2: n3: &n1 {};');
		});
		test('Labels with new lines space', async () => {
			const documentText = 'n1:\nn2:\nn3:&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('n1: n2: n3: &n1 {};');
		});
		test('labels with new line before referance', async () => {
			const documentText = 'n1:\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('n1: &n1 {};');
		});
		test('No space between ref and {', async () => {
			const documentText = '&n1{\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Node extra new line from top', async () => {
			const documentText = '\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});

		test('Node two new line from top', async () => {
			const documentText = '\n\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});

		test('Node multiple new line from top', async () => {
			const documentText = '\n\n\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});

		test('Node no new line from other root', async () => {
			const documentText = '/ {\n};&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n&n1 {};');
		});

		test('Node multiple new line from other root', async () => {
			const documentText = '/ {\n};\n\n\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n&n1 {};');
		});

		test('Node empty new line from other root', async () => {
			const documentText = '/ {\n};\n\n&n1 {\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};\n\n&n1 {};');
		});

		test('Closing } on same line empty node', async () => {
			const documentText = '&n1 {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Closing } empty new line  empty node', async () => {
			const documentText = '&n1 {\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Closing } multiple new line empty node', async () => {
			const documentText = '&n1 {\n\n\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Single space before semicolon', async () => {
			const documentText = '&n1 {\n} ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Multiple spaces before semicolon', async () => {
			const documentText = '&n1 {\n}   ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {};');
		});
		test('Comment before ;', async () => {
			const documentText = '&n1 {\n} /* abc */  ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {}; /* abc */');
		});
		test('Comments before ;', async () => {
			const documentText = '&n1 {\n} /* abc1 */ /* abc2 */   ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&n1 {}; /* abc1 */ /* abc2 */');
		});
	});

	describe('Include', () => {
		test('No space between include and path', async () => {
			const documentText = '#include<>';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('#include <>');
		});

		test('Single space between include and path', async () => {
			const documentText = '#include <>';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('#include <>');
		});

		test('Multiple spaces between include and path', async () => {
			const documentText = '#include    <>';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('#include <>');
		});

		test('Correct indentation in level 1', async () => {
			const documentText = '/ {\n#include <>\n\tnode {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t#include <>\n\n\tnode {};\n};');
		});

		test('Correct indentation in level 2', async () => {
			const documentText = '/ {\n\tnode {\n#include <>\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {\n\t\t#include <>\n\t};\n};');
		});
	});

	describe('Delete node', () => {
		test('No space between include and path', async () => {
			const documentText = '/delete-node/&n1;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1;');
		});

		test('Single space between include and path', async () => {
			const documentText = '/delete-node/ &n1;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1;');
		});

		test('Multiple spaces between include and path', async () => {
			const documentText = '/delete-node/     &n1;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1;');
		});

		test('Correct indentation in level 1', async () => {
			const documentText = '/ {\n/delete-node/ n1;\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/delete-node/ n1;\n\n\tnode {};\n};',
			);
		});

		test('Correct indentation in level 2', async () => {
			const documentText = '/ {\n\tnode {\n/delete-node/ n1;\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tnode {\n\t\t/delete-node/ n1;\n\t};\n};',
			);
		});

		test('Single space between path and ;', async () => {
			const documentText = '/delete-node/ &n1 ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1;');
		});

		test('Multiple space between path and ;', async () => {
			const documentText = '/delete-node/ &n1   ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1;');
		});

		test('Single comment between path and ;', async () => {
			const documentText = '/delete-node/ &n1 /* abc */  ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1; /* abc */');
		});

		test('Multiple comments between path and ;', async () => {
			const documentText = '/delete-node/ &n1 /* abc1 */ /* abc2 */  ;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/delete-node/ &n1; /* abc1 */ /* abc2 */');
		});

		test('One comment after ; and multiple comments between path and ;', async () => {
			const documentText =
				'/delete-node/ &n1 /* abc1 */ /* abc2 */  ; /* abc3 */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/delete-node/ &n1; /* abc1 */ /* abc2 */ /* abc3 */',
			);
		});
	});

	describe('Line Comment', () => {
		test('new line on top of document', async () => {
			const documentText = '\n// foo';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('// foo');
		});

		test('multiple new lines on top of document', async () => {
			const documentText = '\n\n// foo';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('// foo');
		});

		test('Correct indentation in level 1', async () => {
			const documentText = '/ {\n// foo\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t// foo\n\tnode {};\n};');
		});

		test('Correct indentation in level 2', async () => {
			const documentText = '/ {\n\tnode {\n// foo\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {\n\t\t// foo\n\t};\n};');
		});
	});

	describe('Block Comment', () => {
		test('multiline block', async () => {
			const documentText =
				'/*\n* Copyright (c)\n* Copyright (c)\n* Copyright (c) 2018\n *\n* SPDX-License-Identifier: Apache-2.0\n */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/*\n * Copyright (c)\n * Copyright (c)\n * Copyright (c) 2018\n *\n * SPDX-License-Identifier: Apache-2.0\n */',
			);
		});

		test('new line on top of document', async () => {
			const documentText = '\n/* foo */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/* foo */');
		});

		test('Traling */', async () => {
			const documentText = '\n/* foo \nbar */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/* foo\n * bar\n */');
		});

		test('Traling spaces', async () => {
			const documentText = '&node1 {};\n   \n&node2 {};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('&node1 {};\n\n&node2 {};');
		});

		test('multiple new lines on top of document', async () => {
			const documentText = '\n\n/* foo */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/* foo */');
		});
		test('Correct indentation in level 1 single line', async () => {
			const documentText = '/ {\n/* foo */\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/* foo */\n\tnode {};\n};');
		});

		test('Correct indentation in level 1 multi line', async () => {
			const documentText = '/ {\n/* foo\n* bar\n*/\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/* foo\n\t * bar\n\t */\n\tnode {};\n};',
			);
		});

		test('Correct indentation in level 2 single line', async () => {
			const documentText = '/ {\n\tnode {\n/* foo */\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {\n\t\t/* foo */\n\t};\n};');
		});

		test('Correct indentation in level 2 multi line', async () => {
			const documentText = '/ {\n\tnode {\n/* foo \nbar\n*/\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tnode {\n\t\t/* foo\n\t\t * bar\n\t\t */\n\t};\n};',
			);
		});

		test('in ref node', async () => {
			const documentText =
				'&n1 {\n\tprop1;\n\t/* foo */\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'&n1 {\n\tprop1;\n\n\t/* foo */\n\tnode {};\n};',
			);
		});

		test('in node', async () => {
			const documentText =
				'/ {\n\t\t/* foo */\nnode {\n\tprop1;\n\t/* foo */\n\tnode { };\n};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/* foo */\n\tnode {\n\t\tprop1;\n\n\t\t/* foo */\n\t\tnode {};\n\t};\n};',
			);
		});

		test('in property values', async () => {
			const documentText =
				'/ {\n\tprop11 = <10> /* foo */,\n<20>\n/* foo */,\n<30> /* foo */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop11 = <10>, /* foo */\n\t\t\t <20>,\n\t\t\t /* foo */\n\t\t\t <30>; /* foo */\n};',
			);
		});

		test('in property value', async () => {
			const documentText =
				'/ {\n\tprop11 = < /* foo */10 /* foo */\n20\n/* foo */\n30 /* foo */>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop11 = < /* foo */ 10 /* foo */\n\t\t\t  20\n\t\t\t  /* foo */\n\t\t\t  30 /* foo */ >;\n};',
			);
		});

		test('new line start block in line no spaces', async () => {
			const documentText = '/*\nfoo*/';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/*\n * foo\n */');
		});

		test('new line end block in line no spaces', async () => {
			const documentText = '/* foo\n*/';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/* foo\n */');
		});

		test('block in line to many spaces', async () => {
			const documentText = '/*   foo  */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/*   foo  */');
		});
		test('new line end block in line to many spaces', async () => {
			const documentText = '/*   foo\n  */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/*   foo\n */');
		});

		test('new line start block in line to many spaces', async () => {
			const documentText = '/*   \nfoo  */';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/*\n * foo\n */');
		});

		test('nested macros with linked comments', async () => {
			const documentText = `#define ABCD

#ifdef ABCD
/ {
/* FOO */
	node {
			/* FOO */
		node {};
	};
};
#ifdef ABC
/ {
/* FOO */
	node {
			/* FOO */
		node {};
	};
};
#ifdef ABC
/ {
/* FOO */
	node {
			/* FOO */
		node {};
	};
};
#endif
#endif
#endif`;
			const newText = await getNewText(documentText);
			expect(newText).toEqual(`#define ABCD

#ifdef ABCD
/ {
	/* FOO */
	node {
		/* FOO */
		node {};
	};
};
#ifdef ABC
/ {
	/* FOO */
	node {
		/* FOO */
		node {};
	};
};
#ifdef ABC
/ {
	/* FOO */
	node {
		/* FOO */
		node {};
	};
};
#endif
#endif
#endif`);
		});
	});

	describe('Delete property', () => {
		test('No space between include and path', async () => {
			const documentText = '/ {\n\t/delete-property/n1;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/delete-property/ n1;\n};');
		});

		test('Single space between include and path', async () => {
			const documentText = '/ {\n\t/delete-property/ n1;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/delete-property/ n1;\n};');
		});

		test('Multiple spaces between include and path', async () => {
			const documentText = '/ {\n\t/delete-property/ n1;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/delete-property/ n1;\n};');
		});

		test('Correct indentation in level 1', async () => {
			const documentText = '/ {\n/delete-property/ n1;\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/delete-property/ n1;\n\n\tnode {};\n};',
			);
		});

		test('Correct indentation in level 2', async () => {
			const documentText =
				'/ {\n\tnode {\n/delete-property/ n1;\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tnode {\n\t\t/delete-property/ n1;\n\t};\n};',
			);
		});

		test('Single space between path and ;', async () => {
			const documentText = '/ {\n\t/delete-property/ n1 ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/delete-property/ n1;\n};');
		});

		test('Multiple space between path and ;', async () => {
			const documentText = '/ {\n\t/delete-property/ n1  ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\t/delete-property/ n1;\n};');
		});

		test('Single comment between path and ;', async () => {
			const documentText = '/ {\n\t/delete-property/ n1 /* abc */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/delete-property/ n1; /* abc */\n};',
			);
		});

		test('Multiple comments between path and ;', async () => {
			const documentText =
				'/ {\n\t/delete-property/ n1 /* abc1 */ /* abc2 */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/delete-property/ n1; /* abc1 */ /* abc2 */\n};',
			);
		});

		test('One comment after ; and multiple comments between path and ;', async () => {
			const documentText =
				'/ {\n\t/delete-property/ n1 /* abc1 */ /* abc2 */; /* abc3 */\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\t/delete-property/ n1; /* abc1 */ /* abc2 */ /* abc3 */\n};',
			);
		});
	});

	describe('Property', () => {
		test('labels no spaces property name', async () => {
			const documentText = '/ {\n\tl1:l2:l3:prop1= <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tl1: l2: l3: prop1 = <10>;\n};');
		});
		test('labels with new lines spaces property name', async () => {
			const documentText = '/ {\n\tl1:\nl2:\n\nl3:prop1= <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tl1: l2: l3: prop1 = <10>;\n};');
		});
		test('label with new lines before property name', async () => {
			const documentText = '/ {\n\tl1:\nprop1= <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tl1: prop1 = <10>;\n};');
		});
		test('labels no spaces property value', async () => {
			const documentText = '/ {\n\tprop1= <l1:l2:l3:10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <l1: l2: l3: 10>;\n};');
		});
		test('labels with new lines property value', async () => {
			const documentText = '/ {\n\tprop1= <l1:\nl2:\n\nl3:10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <l1: l2: l3: 10>;\n};');
		});
		test('label with new property value', async () => {
			const documentText = '/ {\n\tprop1= <l1:\n10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <l1: 10>;\n};');
		});

		test('labels no spaces property array value', async () => {
			const documentText = '/ {\n\tprop1= l1:l2:l3:<10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = l1: l2: l3: <10>;\n};');
		});
		test('labels with new lines property array value', async () => {
			const documentText = '/ {\n\tprop1= l1:\nl2:\n\nl3:<10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = l1: l2: l3: <10>;\n};');
		});
		test('label with new property array value', async () => {
			const documentText = '/ {\n\tprop1= l1:\n<10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = l1:\n\t\t\t<10>;\n};');
		});

		test('no space before =', async () => {
			const documentText = '/ {\n\tprop1= <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});

		test('multiple spaces before =', async () => {
			const documentText = '/ {\n\tprop1   = <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('no space after =', async () => {
			const documentText = '/ {\n\tprop1 =<10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('multiple space after =', async () => {
			const documentText = '/ {\n\tprop1 =   <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('multiple space after <', async () => {
			const documentText = '/ {\n\tprop1 =   <   10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('single space between array value', async () => {
			const documentText = '/ {\n\tprop1 =   <10 20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10 20>;\n};');
		});
		test('multiple spaces between array value', async () => {
			const documentText = '/ {\n\tprop1 =   <10    20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10 20>;\n};');
		});
		test('comment between array value', async () => {
			const documentText = '/ {\n\tprop1 =   <10 /* foo */  20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10 /* foo */ 20>;\n};');
		});
		test('single new line between array value', async () => {
			const documentText = '/ {\n\tprop1 =   <10\n20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10\n\t\t\t 20>;\n};');
		});

		test('Multi line string', async () => {
			const documentText = '/ {\n\tprop1 = "FOO\nBAR";\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = "FOO\nBAR";\n};');
		});

		test('Escaped string', async () => {
			const documentText =
				'/ {\n\tval = "XA\nXPLUS\nXB", "XSTR1 \\" plus \\" XSTR2";\n\tprop = <10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tval = "XA\nXPLUS\nXB", "XSTR1 \\" plus \\" XSTR2";\n\tprop = <10>;\n};',
			);
		});

		test('multiple new lines between array value', async () => {
			const documentText = '/ {\n\tprop1 =   <10\n\n20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10\n\t\t\t 20>;\n};');
		});
		test('comment and single new line between array value', async () => {
			const documentText = '/ {\n\tprop1 = <10 /* foo */\n 20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <10 /* foo */\n\t\t\t 20>;\n};',
			);
		});
		test('comment and multiple new lines between array value', async () => {
			const documentText = '/ {\n\tprop1 = <10 /* foo */\n\n20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <10 /* foo */\n\t\t\t 20>;\n};',
			);
		});
		test('comment after <', async () => {
			const documentText = '/ {\n\tprop1 = < /* foo */    10>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = < /* foo */ 10>;\n};');
		});
		test('comment before >', async () => {
			const documentText = '/ {\n\tprop1 = <10 /* foo */      >;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10 /* foo */ >;\n};');
		});
		test('multiple space before >', async () => {
			const documentText = '/ {\n\tprop1 = <10   >;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('no space between comma separated values', async () => {
			const documentText = '/ {\n\tprop1 = <10>,<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>, <20>;\n};');
		});
		test('multiple spaces between comma separated values', async () => {
			const documentText = '/ {\n\tprop1 = <10>,    <20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>, <20>;\n};');
		});
		test('single new line after comma separated values', async () => {
			const documentText = '/ {\n\tprop1 = <10>,\n<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>,\n\t\t\t<20>;\n};');
		});
		test('two news line after comma separated values', async () => {
			const documentText = '/ {\n\tprop1 = <10>,\n\n<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>,\n\t\t\t<20>;\n};');
		});
		test('muiltple news line after comma separated values', async () => {
			const documentText = '/ {\n\tprop1 = <10>,\n\n\n<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>,\n\t\t\t<20>;\n};');
		});
		test('comment after comma on new line', async () => {
			const documentText = '/ {\n\tprop1 = <10>,\n/* foo */<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <10>,\n\t\t\t/* foo */ <20>;\n};',
			);
		});
		test('comment before comma', async () => {
			const documentText = '/ {\n\tprop1 = <10> /* foo */, <20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>, /* foo */ <20>;\n};');
		});
		test('multiple before ;', async () => {
			const documentText = '/ {\n\tprop1 = <10>   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('new line before ;', async () => {
			const documentText = '/ {\n\tprop1 = <10>\n;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <10>;\n};');
		});
		test('Correct indentation in level 1', async () => {
			const documentText = '/ {\nprop1;\n\tnode { };\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1;\n\n\tnode {};\n};');
		});

		test('Correct indentation in level 2', async () => {
			const documentText = '/ {\n\tnode {\nprop1;\n\t};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tnode {\n\t\tprop1;\n\t};\n};');
		});

		test('Single space between path and ;', async () => {
			const documentText = '/ {\n\tprop1 ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1;\n};');
		});

		test('Multiple space between path and ;', async () => {
			const documentText = '/ {\n\tprop1  ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1;\n};');
		});

		test('Single comment between path and ;', async () => {
			const documentText = '/ {\n\tprop1 /* abc */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1; /* abc */\n};');
		});

		test('Multiple comments between path and ;', async () => {
			const documentText = '/ {\n\tprop1 /* abc1 */ /* abc2 */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1; /* abc1 */ /* abc2 */\n};');
		});

		test('One comment after ; and multiple comments between path and ;', async () => {
			const documentText =
				'/ {\n\tprop1 /* abc1 */ /* abc2 */; /* abc3 */\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1; /* abc1 */ /* abc2 */ /* abc3 */\n};',
			);
		});

		test('CMacroCall assign with space betweeb function name and ( ', async () => {
			const documentText = '/ {\n\tprop1 = ADD(10, 20);\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = ADD(10, 20);\n};');
		});

		test('CMacroCall assign in Array Value with space between function name and ( ', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(10, 20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <ADD(10, 20)>;\n};');
		});

		test('CMacroCall assign param spacing from (', async () => {
			const documentText = '/ {\n\tprop1 = ADD(   10, 20);\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = ADD(   10, 20);\n};');
		});

		test('CMacroCall assign in Array param spacing from (', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(    10, 20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <ADD(    10, 20)>;\n};');
		});

		test('CMacroCall assign param spacing from )', async () => {
			const documentText = '/ {\n\tprop1 = ADD(10, 20    );\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = ADD(10, 20);\n};');
		});

		test('CMacroCall assign in Array param spacing from )', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(10, 20     )>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <ADD(10, 20)>;\n};');
		});

		test('CMacroCall assign param spacing from ,', async () => {
			const documentText = '/ {\n\tprop1 = ADD(10   ,     20);\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = ADD(10   ,     20);\n};');
		});

		test('CMacroCall assign in Array param spacing from ,', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(10   ,     20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <ADD(10   ,     20)>;\n};');
		});

		test('CMacroCall assign param macro before ,', async () => {
			const documentText =
				'/ {\n\tprop1 = ADD(10 /* foo */    , 20);\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = ADD(10 /* foo */    , 20);\n};',
			);
		});

		test('Complex Expression extra stapce after (', async () => {
			const documentText = '/ {\n\tprop1 = <( 10 + 20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 + 20)>;\n};');
		});

		test('Complex Expression extra stapce before )', async () => {
			const documentText = '/ {\n\tprop1 = <(10 + 20 )>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 + 20)>;\n};');
		});

		test('Complex Expression extra spaces between operators', async () => {
			const documentText = '/ {\n\tprop1 = <(10    +     20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 + 20)>;\n};');
		});

		test('Nested Complex Expression', async () => {
			const documentText =
				'/ {\n\tprop1 = <(10    +     (10    +     (50 - ADD(  5 ,   50)) * 5  ))>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(10 + (10 + (50 - ADD(  5 ,   50)) * 5))>;\n};',
			);
		});

		test('Complex Expression on multi line', async () => {
			const documentText = '/ {\n\tprop1 = <(10 +\n20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 +\n\t\t\t 20)>;\n};');
		});

		test('Complex Expression first expression and element on new line', async () => {
			const documentText = '/ {\n\tprop1 = <(\n10 + 20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 + 20)>;\n};');
		});

		test('Complex Expression second expression and firt element on new line', async () => {
			const documentText = '/ {\n\tprop1 = <(10 + 20) (\n10 + 20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(10 + 20) (10 + 20)>;\n};',
			);
		});

		test('Complex Expression on multi line', async () => {
			const documentText = '/ {\n\tprop1 = <(10 +\n20)>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(10 +\n\t\t\t 20)>;\n};');
		});

		test('Complex Nested Expression on multi line', async () => {
			const documentText = '/ {\n\tprop1 = <(5 + (10 +\n20))>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(5 + (10 +\n\t\t\t 20))>;\n};',
			);
		});

		test('Complex Arg allow on new line(', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(10,\n\n(10 + 20))>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <ADD(10,\n\n(10 + 20))>;\n};',
			);
		});

		test('CMacroCall allow new line between operators )', async () => {
			const documentText =
				'/ {\n\tprop1 = <(ADD(10, 20) +\nADD(30, 40) +\n(ADD(10, 20) + \nADD(30, 40)))>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(ADD(10, 20) +\n\t\t\t ADD(30, 40) +\n\t\t\t (ADD(10, 20) +\n\t\t\t ADD(30, 40)))>;\n};',
			);
		});

		test('CMacroCall (2) allow new line between operators )', async () => {
			const documentText =
				'/ {\n\trdc = <(RDC_DOMAIN_PERM(A53_DOMAIN_ID, RDC_DOMAIN_PERM_RW) |\nRDC_DOMAIN_PERM(M7_DOMAIN_ID, RDC_DOMAIN_PERM_RW))>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\trdc = <(RDC_DOMAIN_PERM(A53_DOMAIN_ID, RDC_DOMAIN_PERM_RW) |\n\t\t   RDC_DOMAIN_PERM(M7_DOMAIN_ID, RDC_DOMAIN_PERM_RW))>;\n};',
			);
		});

		test('byte string test', async () => {
			const documentText =
				'/ {\n\tprop1 = [    10    20    30    40]   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = [10 20 30 40];\n};');
		});
		test('byte string allow on new line', async () => {
			const documentText = '/ {\n\tprop11 = [10\n20\n30\n40]   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop11 = [10\n\t\t\t  20\n\t\t\t  30\n\t\t\t  40];\n};',
			);
		});

		test('byte string first and last on new line', async () => {
			const documentText =
				'/ {\n\tprop11 = [\n\n10\n20\n30\n40\n]   ;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop11 = [10\n\t\t\t  20\n\t\t\t  30\n\t\t\t  40];\n};',
			);
		});

		test('Comments stays between property', async () => {
			const documentText =
				'/ {\n\tprop1 = <10>,\n\t\t\t/* abc2 */\n\t\t\t<20>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <10>,\n\t\t\t/* abc2 */\n\t\t\t<20>;\n};',
			);
		});

		test('values new line commas after comment', async () => {
			const documentText =
				'/ {\n\tprop1 = <1 0 &gpio0 0 0> /* D1 */\n\n\n, <0 0 &gpio0 1 0> /* D0 */\n, <2 0 &gpio0 2 0> /* D2 */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <1 0 &gpio0 0 0>, /* D1 */\n\t\t\t<0 0 &gpio0 1 0>, /* D0 */\n\t\t\t<2 0 &gpio0 2 0>; /* D2 */\n};',
			);
		});

		test('comma on a new line', async () => {
			const documentText =
				'/ {\n\tprop1 = <1 0 &gpio0 0 0>\n\n\n, <0 0 &gpio0 1 0>\n, <2 0 &gpio0 2 0>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <1 0 &gpio0 0 0>,\n\t\t\t<0 0 &gpio0 1 0>,\n\t\t\t<2 0 &gpio0 2 0>;\n};',
			);
		});

		test('comma and values on a new line with comment before and after value', async () => {
			const documentText =
				'/ {\n\tprop1 = <1 0 &gpio0 0 0> /* D1 */\n/* D11 */, <0 0 &gpio0 1 0> /* D0 */\n/* D00 */, <2 0 &gpio0 2 0> /* D2 */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <1 0 &gpio0 0 0>, /* D1 */\n\t\t\t/* D11 */ <0 0 &gpio0 1 0>, /* D0 */\n\t\t\t/* D00 */ <2 0 &gpio0 2 0>; /* D2 */\n};',
			);
		});

		test('comma and values on a new line with comment after value', async () => {
			const documentText =
				'/ {\n\tgpio-map\n= <1 0 &gpio0 0 0> /* D1 */\n\n\n, <0 0 &gpio0 1 0> /* D0 */\n\t\t\t, <2 0 &gpio0 2 0> /* D2 */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tgpio-map = <1 0 &gpio0 0 0>, /* D1 */\n\t\t\t   <0 0 &gpio0 1 0>, /* D0 */\n\t\t\t   <2 0 &gpio0 2 0>; /* D2 */\n};',
			);
		});

		test('Comment after - before value', async () => {
			const documentText =
				'/ {\n\tprop1 = \n/* FOO */\n<1 0 &gpio0 0 0>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 =\n\t\t\t/* FOO */\n\t\t\t<1 0 &gpio0 0 0>;\n};',
			);
		});

		test('new line after =', async () => {
			const documentText = '/ {\n\tprop1 = \n<1 0 &gpio0 0 0>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <1 0 &gpio0 0 0>;\n};');
		});

		test('multple comments before and after commas on new line', async () => {
			const documentText =
				'/ {\n\tgpio-map\n= <1 0 &gpio0 0 0> /* D1 */ /* D2 */\n/* D3 */ /* D4 */, /* D5 */ /* D6 */ <0 0 &gpio0 1 0> /* D7 */ /* D8 */\n\t\t\t/* D9 */,/* D10 */ /* D11 */<2 0 &gpio0 2 0> /* D12 */; /* D13 */\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tgpio-map = <1 0 &gpio0 0 0>, /* D1 */ /* D2 */\n\t\t\t   /* D3 */ /* D4 */ /* D5 */ /* D6 */ <0 0 &gpio0 1 0>, /* D7 */ /* D8 */\n\t\t\t   /* D9 *//* D10 */ /* D11 */ <2 0 &gpio0 2 0>; /* D12 */ /* D13 */\n};',
			);
		});

		test('Macro on multiple lines', async () => {
			const documentText = '/ {\n\tprop1 = <ADD(10, \\\n\t\t20)>;};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <ADD(10, \\\n\t\t20)>;\n};',
			);
		});

		test('Macro expression with ()', async () => {
			const documentText = '/ {\n\tprop1 = <(ADD(10, \\\n\t\t20) )>;};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <ADD(10, \\\n\t\t20)>;\n};',
			);
		});

		test('Number expression with ()', async () => {
			const documentText = '/ {\n\tprop1 = <(-10)>;};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <(-10)>;\n};');
		});

		test('Multiple Macro expression in ()', async () => {
			const documentText =
				'/ {\n\tprop1 = <(ADD(10, \\\n\t\t20) + ADD(10, \\\n\t\t20) )>;};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(ADD(10, \\\n\t\t20) + ADD(10, \\\n\t\t20))>;\n};',
			);
		});

		test('Multiple Macro and number expression in ()', async () => {
			const documentText =
				'/ {\n\tprop1 = <(ADD(10, \\\n\t\t20) + 10 )>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop1 = <(ADD(10, \\\n\t\t20) + 10)>;\n};',
			);
		});

		test('hex with 0XD > on same line', async () => {
			const documentText = '/ {\n\tprop1 = <0XD>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <0XD>;\n};');
		});

		test('hex with 0XD > on new line', async () => {
			const documentText = '/ {\n\tprop1 = <0XD\n>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <0XD>;\n};');
		});

		test('hex with 0XD with line comment > on new line', async () => {
			const documentText = '/ {\n\tprop1 = <0XD // test\n>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <0XD // test\n\t>;\n};');
		});

		test('hex with 0XD with block comment > on new line', async () => {
			const documentText = '/ {\n\tprop1 = <0XD /* test */\n>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <0XD /* test */ >;\n};');
		});

		test('empty array value with spaces', async () => {
			const documentText = '/ {\n\tprop1 = < >;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <>;\n};');
		});

		test('empty array value new line', async () => {
			const documentText = '/ {\n\tprop1 = < \n>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = <>;\n};');
		});

		test('empty bytestring value', async () => {
			const documentText = '/ {\n\tprop1 = [ ];\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = [];\n};');
		});

		test('remove first property new line ', async () => {
			const documentText = '/ {\n\n\tprop1 = [ ];\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {\n\tprop1 = [];\n};');
		});
	});

	describe('trailing White space', () => {
		test('Clean when remove new lines', async () => {
			const documentText = '/ {\n    \n}     \n;';
			const newText = await getNewText(documentText);
			expect(newText).toEqual('/ {};');
		});
		test('Clean when remove new lines', async () => {
			const documentText =
				'/ {\n\tprop11 = <10>, \n<20>,            \n<30>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop11 = <10>,\n\t\t\t <20>,\n\t\t\t <30>;\n};',
			);
		});

		test('move to new lines', async () => {
			const documentText =
				'&spi1_nss_pa4 { slew-rate = "very-high-speed"; };';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'&spi1_nss_pa4 {\n\tslew-rate = "very-high-speed";\n};',
			);
		});

		test('empty node', async () => {
			const documentText = `arduino_i2c: &i2c1 {};\narduino_spi: &spi1 {};`;
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				`arduino_i2c: &i2c1 {};\n\narduino_spi: &spi1 {};`,
			);
		});

		test('after semicolon', async () => {
			const documentText = `&i2c1 {\n\tprop1;    \n};     \n&spi1 {};     `;
			const newText = await getNewText(documentText);
			expect(newText).toEqual(`&i2c1 {\n\tprop1;\n};\n\n&spi1 {};`);
		});

		test('move to new lines', async () => {
			const documentText = `sysclk: system-clock {
	compatible = "fixed-clock";
	clock-frequency = <25000000>;
	#clock-cells = <0>;
};`;
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				`sysclk: system-clock {
	compatible = "fixed-clock";
	clock-frequency = <25000000>;
	#clock-cells = <0>;
};`,
			);
		});
	});

	describe('Maco dependent code', () => {
		test('Comment not linked inside a if def', async () => {
			const documentText =
				'/ {\n#ifdef ABC\nnode {};node {};\n#else\nnode {};prop;node {};\n#endif\n\tnode1 {};\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n#ifdef ABC\n\tnode {};\n\n\tnode {};\n#else\n\tnode {};\n\n\tprop;\n\n\tnode {};\n#endif\n\n\tnode1 {};\n};',
			);
		});
	});
	describe('Format on off', () => {
		test('line comment off and on', async () => {
			const documentText =
				'// dts-format off \n/ {\n    \n};\n// dts-format on\n/ {\n    \n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'// dts-format off \n/ {\n    \n};\n// dts-format on\n/ {};',
			);
		});

		test('line comment only off', async () => {
			const documentText =
				'// dts-format off \n/ {\n    \n};\n/ {\n    \n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'// dts-format off \n/ {\n    \n};\n/ {\n    \n};',
			);
		});

		test('block comment on off', async () => {
			const documentText =
				'/ {\n\tprop   = /* dts-format off  */     <10     20   /* dts-format on  */  30   40>;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop = /* dts-format off  */     <10     20   /* dts-format on  */ 30 40>;\n};',
			);
		});

		test('in between block comment on off', async () => {
			const documentText =
				'/ {\n\tprop   = /* dts-format off  */ <10 20 30 40> /* foo */ /* dts-format on  */;\n};';
			const newText = await getNewText(documentText);
			expect(newText).toEqual(
				'/ {\n\tprop = /* dts-format off  */ <10 20 30 40> /* foo */ /* dts-format on  */;\n};',
			);
		});
	});
});
