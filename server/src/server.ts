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
	SemanticTokensBuilder,
} from 'vscode-languageserver/node';

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Lexer } from './lexer';
import { astMap } from './resultCache';
import { ContextIssues, SyntaxIssue, tokenModifiers, tokenTypes } from './types';
import { Parser } from './parser';
import { toRange } from './helpers';
import { ContextAware } from './runtimeEvaluator';

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
			documentSymbolProvider: true,
			semanticTokensProvider: {
				legend: {
					tokenTypes: tokenTypes as unknown as string[],
					tokenModifiers: tokenModifiers as unknown as string[],
				},
				full: true,
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

const syntaxIssueToMessage = (issue: SyntaxIssue) => {
	switch (issue) {
		case SyntaxIssue.VALUE:
			return 'Expected Value';
		case SyntaxIssue.END_STATMENT:
			return "Expected ';'";
		case SyntaxIssue.CURLY_OPEN:
			return "Expected '{'";
		case SyntaxIssue.CURLY_CLOSE:
			return "Expected '}'";
		case SyntaxIssue.OPEN_SQUARE:
			return "Expected '['";
		case SyntaxIssue.SQUARE_CLOSE:
			return "Expected ']'";
		case SyntaxIssue.PROPERTY_NAME:
			return 'Expected property name';
		case SyntaxIssue.NODE_NAME:
			return 'Expected node name';
		case SyntaxIssue.NODE_ADDRESS:
			return 'Expected node address';
		case SyntaxIssue.NODE_DEFINITION:
			return 'Expected node definition';
		case SyntaxIssue.PROPERTY_DEFINITION:
			return 'Expected property definition';
		case SyntaxIssue.NUMERIC_VALUE:
			return 'Expected numerical value';
		case SyntaxIssue.NODE_PATH:
			return 'Expected node path';
		case SyntaxIssue.NODE_REF:
			return 'Expected node ref';
		case SyntaxIssue.GT_SYM:
			return "Expected '>'";
		case SyntaxIssue.LT_SYM:
			return "Expected '<'";
		case SyntaxIssue.BYTESTRING:
			return 'Expected bytes string ';
		case SyntaxIssue.BYTESTRING_EVEN:
			return 'Expected two digits in bytestring';
		case SyntaxIssue.DUOUBE_QUOTE:
			return "Expected '\"'";
		case SyntaxIssue.SINGLE_QUOTE:
			return "Expected '\\''";
		case SyntaxIssue.VALID_NODE_PATH:
			return 'Expected valid node path';
		case SyntaxIssue.LABEL_NAME:
			return 'Expected Label name';
		case SyntaxIssue.FORWARD_SLASH_START_PATH:
			return "Expected '/' in the state of a node path";
		case SyntaxIssue.BYTESTRING_HEX:
			return 'Expected hex values are not allowed';
		case SyntaxIssue.FORWARD_SLASH_END_DELETE:
			return "Trailing '/' at the end of delete keyword";
		case SyntaxIssue.NO_STAMENTE:
			return "Found ';' without a statment";
		case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
			return "Missing ':' for label assign";
		case SyntaxIssue.DELETE_INCOMPLETE:
			return 'Did you mean /delete-node/ or /delete-property/';
		case SyntaxIssue.NODE_PATH_WHITE_SPACE_NOT_ALLOWED:
			return 'White space is not allowrd after "{" or after "}"';
		case SyntaxIssue.UNKNOWN:
			return 'Unknown syntax';
	}
};

const contextIssuesToMessage = (issue: ContextIssues) => {
	switch (issue) {
		case ContextIssues.DUPLICATE_PROPERTY_NAME:
			return 'Property name already defined.';
		case ContextIssues.PROPERTY_DOES_NOT_EXIST:
			return 'Cannot delete a property before it has been defined';
		case ContextIssues.DUPLICATE_NODE_NAME:
			return 'Node name already defined';
		case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
			return 'No node with that referance has been defined';
		case ContextIssues.LABEL_ALREADY_IN_USE:
			return 'Label aready defined';
		case ContextIssues.NODE_DOES_NOT_EXIST:
			return 'Cannot delete a node before it has been defined';
		case ContextIssues.RE_ASSIGN_NODE_LABEL:
			return 'Label has already been assign to a different Node.';
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

	astMap.set(textDocument.uri, { lexer, parser });

	const diagnostics: Diagnostic[] = [];
	parser.issues.forEach((issue) => {
		const diagnostic: Diagnostic = {
			severity: issue.severity,
			range: toRange(issue.slxElement),
			message: issue.issues ? issue.issues.map(syntaxIssueToMessage).join(' or ') : '',
			source: 'devie tree',
		};
		diagnostics.push(diagnostic);
	});

	const contextAware = new ContextAware([textDocument.uri], new AbortController());
	contextAware.issues.forEach((issue) => {
		const diagnostic: Diagnostic = {
			severity: issue.severity,
			range: toRange(issue.slxElement),
			message: issue.issues ? issue.issues.map(contextIssuesToMessage).join(' or ') : '',
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
		const meta = astMap.get(_textDocumentPosition.textDocument.uri);
		if (meta) {
			// TODO
		}
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

connection.onDocumentSymbol((h) => {
	const data = astMap.get(h.textDocument.uri);
	if (!data) return [];

	return data.parser.getDocumentSymbols();
});

connection.languages.semanticTokens.on((h) => {
	const tokensBuilder = new SemanticTokensBuilder();

	const data = astMap.get(h.textDocument.uri);
	data?.parser.buildSemanticTokens(tokensBuilder);

	return tokensBuilder.build();
});
