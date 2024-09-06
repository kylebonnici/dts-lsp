/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Lexer } from './lexer';
import { Issues, Parser } from './parser';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true,
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false,
			},
		},
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true,
			},
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders((_event) => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

connection.onDidChangeConfiguration((change) => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = <ExampleSettings>(
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample',
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose((e) => {
	documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document),
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: [],
		} satisfies DocumentDiagnosticReport;
	}
});

const issueToMessage = (issue: Issues) => {
	switch (issue) {
		case Issues.VALUE:
			return 'Expected Value';
		case Issues.END_STATMENT:
			return "Expected ';'";
		case Issues.CURLY_OPEN:
			return "Expected '{'";
		case Issues.CURLY_CLOSE:
			return "Expected '}'";
		case Issues.OPEN_SQUARE:
			return "Expected '['";
		case Issues.SQUARE_CLOSE:
			return "Expected ']'";
		case Issues.PROPERTY_NAME:
			return 'Expected property name';
		case Issues.NODE_NAME:
			return 'Expected node name';
		case Issues.NODE_ADDRESS:
			return 'Expected node address';
		case Issues.NODE_DEFINITION:
			return 'Expected node definition';
		case Issues.PROPERTY_DEFINITION:
			return 'Expected property definition';
		case Issues.NUMERIC_VALUE:
			return 'Expected numerical value';
		case Issues.NODE_PATH:
			return 'Expected node path';
		case Issues.NODE_REF:
			return 'Expected node ref';
		case Issues.GT_SYM:
			return "Expected '>'";
		case Issues.LT_SYM:
			return "Expected '<'";
		case Issues.BYTESTRING:
			return 'Expected bytes string ';
		case Issues.BYTESTRING_EVEN:
			return 'Expected two digits in bytestring';
		case Issues.DUOUBE_QUOTE:
			return "Expected '\"'";
		case Issues.SINGLE_QUOTE:
			return "Expected '\\''";
		case Issues.VALID_NODE_PATH:
			return 'Expected valid node path';
		case Issues.LABEL_NAME:
			return 'Expected Label name';
		case Issues.FORWARD_SLASH_START_PATH:
			return "Expected '/' in the state of a node path";
		case Issues.BYTESTRING_HEX:
			return 'Expected hex values are not allowed';
		case Issues.FORWARD_SLASH_END_DELETE:
			return "Trailing '/' at the end of the path";
		case Issues.UNKNOWN:
			return 'Unknown syntax';
	}
};

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	// // In this simple example we get the settings for every validate run.
	// const settings = await getDocumentSettings(textDocument.uri);

	// // The validator creates diagnostics for all uppercase words length 2 and more
	// const text = textDocument.getText();
	// const pattern = /\b[A-Z]{2,}\b/g;
	// let m: RegExpExecArray | null;

	// let problems = 0;
	// const diagnostics: Diagnostic[] = [];
	// while ((m = pattern.exec(text)) && problems < settings.maxNumberOfProblems) {
	// 	problems++;
	// 	const diagnostic: Diagnostic = {
	// 		severity: DiagnosticSeverity.Warning,
	// 		range: {
	// 			start: textDocument.positionAt(m.index),
	// 			end: textDocument.positionAt(m.index + m[0].length),
	// 		},
	// 		message: `${m[0]} is all uppercase.`,
	// 		source: 'ex',
	// 	};
	// 	if (hasDiagnosticRelatedInformationCapability) {
	// 		diagnostic.relatedInformation = [
	// 			{
	// 				location: {
	// 					uri: textDocument.uri,
	// 					range: Object.assign({}, diagnostic.range),
	// 				},
	// 				message: 'Spelling matters',
	// 			},
	// 			{
	// 				location: {
	// 					uri: textDocument.uri,
	// 					range: Object.assign({}, diagnostic.range),
	// 				},
	// 				message: 'Particularly for names',
	// 			},
	// 		];
	// 	}
	// 	diagnostics.push(diagnostic);
	// }
	// return diagnostics;

	const lexer = new Lexer(textDocument.getText());
	const parser = new Parser(lexer.tokens);

	const diagnostics: Diagnostic[] = [];
	parser.issues.forEach((issue) => {
		const diagnostic: Diagnostic = {
			severity: DiagnosticSeverity.Warning,
			range: {
				start: {
					line: issue.token?.pos.line ?? 0,
					character: (issue.token?.pos.col ?? 0) + 1,
				},
				end: {
					line: issue.token?.pos.line ?? 0,
					character: (issue.token?.pos.col ?? 0) + 1 + (issue.token?.pos.len ?? 0),
				},
			},
			message: issue.issues ? issue.issues.map(issueToMessage).join(' or ') : '',
			source: 'devie tree',
		};
		diagnostics.push(diagnostic);
	});

	return diagnostics;
}

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
		// The pass parameter contains the position of the text document in
		// which code complete got requested. For the example we ignore this
		// info and always provide the same completion items.
		return [
			{
				label: 'TypeScript',
				kind: CompletionItemKind.Text,
				data: 1,
			},
			{
				label: 'JavaScript',
				kind: CompletionItemKind.Text,
				data: 2,
			},
		];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details';
		item.documentation = 'TypeScript documentation';
	} else if (item.data === 2) {
		item.detail = 'JavaScript details';
		item.documentation = 'JavaScript documentation';
	}
	return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
