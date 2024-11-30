/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
  createConnection,
  TextDocuments,
  Diagnostic,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  TextDocumentPositionParams,
  TextDocumentSyncKind,
  InitializeResult,
  DocumentDiagnosticReportKind,
  type DocumentDiagnosticReport,
  SemanticTokensBuilder,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ContextIssues,
  Issue,
  StandardTypeIssue,
  SyntaxIssue,
  tokenModifiers,
  tokenTypes,
} from "./types";
import { findContext, resolveContextFiles, toRange } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { getCompleteions } from "./completion";
import { getReferences } from "./findReferences";
import { getTokenizedDocmentProvider } from "./providers/tokenizedDocument";
import { getDefinitions } from "./findDefinitons";
import { getDeclaration } from "./findDeclarations";

let contextAware: ContextAware[] = [];

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
        triggerCharacters: ["&", "=", " "],
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
      documentLinkProvider: {
        resolveProvider: false,
      },
      definitionProvider: true,
      declarationProvider: true,
      referencesProvider: true,
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
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

// The example settings
interface ExampleSettings {
  includePath: string[];
  common: string[];
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = {
  includePath: [
    "/opt/nordic/ncs/v2.8.0/zephyr/dts",
    "/opt/nordic/ncs/v2.8.0/zephyr/dts/arm",
    "/opt/nordic/ncs/v2.8.0/zephyr/dts/arm64/",
    "/opt/nordic/ncs/v2.8.0/zephyr/dts/riscv",
    "/opt/nordic/ncs/v2.8.0/zephyr/dts/common",
    "/opt/nordic/ncs/v2.8.0/zephyr/include",
  ],
  common: ["/opt/nordic/ncs/v2.8.0/zephyr/dts/common"],
};
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
      section: "languageServerExample",
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
      items: await getDiagnostics(document),
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
      return "Expected Value";
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
      return "Expected property name";
    case SyntaxIssue.NODE_NAME:
      return "Expected node name";
    case SyntaxIssue.NODE_ADDRESS:
      return "Expected node address";
    case SyntaxIssue.NODE_DEFINITION:
      return "Expected node definition";
    case SyntaxIssue.PROPERTY_DEFINITION:
      return "Expected property definition";
    case SyntaxIssue.NUMERIC_VALUE:
      return "Expected numerical value";
    case SyntaxIssue.NODE_PATH:
      return "Expected node path";
    case SyntaxIssue.NODE_REF:
      return "Expected node ref";
    case SyntaxIssue.GT_SYM:
      return "Expected '>'";
    case SyntaxIssue.LT_SYM:
      return "Expected '<'";
    case SyntaxIssue.BYTESTRING:
      return "Expected bytes string ";
    case SyntaxIssue.BYTESTRING_EVEN:
      return "Expected two digits in bytestring";
    case SyntaxIssue.DUOUBE_QUOTE:
      return "Expected '\"'";
    case SyntaxIssue.SINGLE_QUOTE:
      return "Expected '\\''";
    case SyntaxIssue.VALID_NODE_PATH:
      return "Expected valid node path";
    case SyntaxIssue.LABEL_NAME:
      return "Expected Label name";
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
      return "Expected '/' in the state of a node path";
    case SyntaxIssue.BYTESTRING_HEX:
      return "Expected hex values are not allowed";
    case SyntaxIssue.FORWARD_SLASH_END_DELETE:
      return "Trailing '/' at the end of delete keyword";
    case SyntaxIssue.NO_STAMENTE:
      return "Found ';' without a statment";
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
      return "Missing ':' for label assign";
    case SyntaxIssue.DELETE_INCOMPLETE:
      return "Did you mean /delete-node/ or /delete-property/";
    case SyntaxIssue.NODE_PATH_WHITE_SPACE_NOT_ALLOWED:
      return 'White space is not allowrd after "{" or after "}"';
    case SyntaxIssue.UNKNOWN:
      return "Unknown syntax";
    case SyntaxIssue.EXPECTED_EXPRESSION:
      return "Expected expression";
    case SyntaxIssue.MISSING_ROUND_CLOSE:
      return 'Expected "("';
    case SyntaxIssue.INCLUDE_CLOSE_PATH:
      return 'Include missing ">"';
    case SyntaxIssue.INVALID_INCLUDE_SYNTAX:
      return "Invalid include Syntax";
    case SyntaxIssue.MISSING_COMMA:
      return 'Missing ","';
    case SyntaxIssue.EXPECTED_IDENTIFIER:
      return "Expected Macro Idenifier";
    case SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE:
      return "Expected Macro Idenifier or Function like Macro";
    case SyntaxIssue.NODE_NAME_ADDRESS_WHITE_SPACE:
      return "No white space between no name and address is allowed";
  }
};

const contextIssuesToMessage = (issue: Issue<ContextIssues>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case ContextIssues.DUPLICATE_PROPERTY_NAME:
          return `Property "${issue.templateStrings[0]}" is replaced by a later definiton.`;
        case ContextIssues.PROPERTY_DOES_NOT_EXIST:
          return "Cannot delete a property before it has been defined";
        case ContextIssues.DUPLICATE_NODE_NAME:
          return "Node name already defined";
        case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
          return `No node with that referance "${issue.templateStrings[0]}" has been defined`;
        case ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH:
          return `No node with name "${issue.templateStrings[0]}" could be found in "/${issue.templateStrings[1]}".`;
        case ContextIssues.LABEL_ALREADY_IN_USE:
          return `Label name "${issue.templateStrings[0]}" aready defined`;
        case ContextIssues.DELETE_PROPERTY:
          return `Property "${issue.templateStrings[0]}" was deleted.`;
        case ContextIssues.DELETE_NODE:
          return `Node "${issue.templateStrings[0]}" was deleted.`;
        case ContextIssues.NODE_DOES_NOT_EXIST:
          return "Cannot delete a node before it has been defined";
      }
    })
    .join(" or ");
};

const contextIssuesToLinkedMessage = (issue: ContextIssues) => {
  switch (issue) {
    case ContextIssues.DUPLICATE_PROPERTY_NAME:
      return "Property name already defined.";
    case ContextIssues.PROPERTY_DOES_NOT_EXIST:
      return "Cannot delete a property before it has been defined";
    case ContextIssues.DUPLICATE_NODE_NAME:
      return "Node name already defined";
    case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
      return "No node with that referance has been defined";
    case ContextIssues.LABEL_ALREADY_IN_USE:
      return "Label aready defined here";
    case ContextIssues.NODE_DOES_NOT_EXIST:
      return "Cannot delete a node before it has been defined";
  }
};

const standardTypeIssueIssuesToMessage = (issue: Issue<StandardTypeIssue>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case StandardTypeIssue.EXPECTED_ENUM:
          return `Only these value are allowed ${issue.templateStrings[0]}.`;
        case StandardTypeIssue.EXPECTED_EMPTY:
          return `Property "${issue.templateStrings[0]}" should not be assigned any value.`;
        case StandardTypeIssue.EXPECTED_ONE:
          return `Property "${issue.templateStrings[0]}" can only be assigned one value`;
        case StandardTypeIssue.EXPECTED_U32:
          return `Property "${issue.templateStrings[0]}" should be assiged a U32`;
        case StandardTypeIssue.EXPECTED_U64:
          return `Property "${issue.templateStrings[0]}" should be assiged a U64`;
        case StandardTypeIssue.EXPECTED_PHANDEL:
          return `Property "${issue.templateStrings[0]}" should be assiged a phandel`;
        case StandardTypeIssue.EXPECTED_STRING:
          return `Property "${issue.templateStrings[0]}" should be assiged a string`;
        case StandardTypeIssue.EXPECTED_STRINGLIST:
          return `Property "${issue.templateStrings[0]}" should be assiged a string list`;
        case StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH:
          return `Property "${issue.templateStrings[0]}" expects ${issue.templateStrings[1]} values`;
        case StandardTypeIssue.REQUIRED:
          return `Property "${issue.templateStrings[0]}" is requiered.`;
        case StandardTypeIssue.EXPECTED_U32_U64:
          return `Property "${issue.templateStrings[0]}" value must be U32 or U64`;
      }
    })
    .join(" or ");
};

// // The content of a text document has changed. This event is emitted
// // when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
  console.time("revaluate");
  const uri = change.document.uri.replace("file://", "");

  getTokenizedDocmentProvider().renewLexer(uri, change.document.getText());

  const context = await findContext(contextAware, uri);

  if (!context) {
    console.log("new context");

    const newContext = new ContextAware(
      uri,
      defaultSettings.includePath,
      defaultSettings.common
    );
    contextAware.push(newContext);

    await newContext.parser.stable;
    const newContextFiles = await newContext.getOrderedContextFiles();
    const contextFiles = await resolveContextFiles(contextAware);
    const contextToClean = contextFiles
      .filter(
        (o) =>
          o.context !== newContext &&
          newContextFiles.some((f) => o.files.indexOf(f) !== -1)
      )
      .map((o) => o.context);
    contextAware = contextAware.filter((c) => contextToClean.indexOf(c) === -1);
    console.log(
      "cleanin up contexts",
      contextToClean.length,
      contextAware.length
    );
    contextAware.push(newContext);
  } else {
    await context.context.revaluate(uri);
  }

  console.timeEnd("revaluate");
});

async function getDiagnostics(
  textDocument: TextDocument
): Promise<Diagnostic[]> {
  const uri = textDocument.uri.replace("file://", "");
  const diagnostics: Diagnostic[] = [];

  const contextMeta = await findContext(contextAware, uri);
  await contextMeta?.context.parser.stable;

  const parser = await contextMeta?.context.getParser(uri);
  parser?.issues.forEach((issue) => {
    const diagnostic: Diagnostic = {
      severity: issue.severity,
      range: toRange(issue.astElement),
      message: issue.issues
        ? issue.issues.map(syntaxIssueToMessage).join(" or ")
        : "",
      source: "devie tree",
    };
    diagnostics.push(diagnostic);
  });

  const contextIssues = (await contextMeta?.context.getContextIssues()) ?? [];
  contextIssues
    .filter((issue) => issue.astElement.uri === uri)
    .forEach((issue) => {
      const diagnostic: Diagnostic = {
        severity: issue.severity,
        range: toRange(issue.astElement),
        message: contextIssuesToMessage(issue),
        source: "devie tree",
        tags: issue.tags,
        relatedInformation: [
          ...issue.linkedTo.map((element) => ({
            message: issue.issues
              .map(contextIssuesToLinkedMessage)
              .join(" or "),
            location: {
              uri: `file://${element.uri!}`,
              range: toRange(element),
            },
          })),
        ],
      };
      diagnostics.push(diagnostic);
    });

  const runtime = await contextMeta?.context.getRuntime();
  runtime?.typesIssues
    .filter((issue) => issue.astElement.uri === uri)
    .forEach((issue) => {
      const diagnostic: Diagnostic = {
        severity: issue.severity,
        range: toRange(issue.astElement),
        message: standardTypeIssueIssuesToMessage(issue),
        source: "devie tree",
        tags: issue.tags,
      };
      diagnostics.push(diagnostic);
    });

  return diagnostics;
}

connection.onDidChangeWatchedFiles((_change) => {
  // Monitored files have change in VSCode
  connection.console.log("We received a file change event");
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
  async (
    _textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> => {
    // The pass parameter contains the position of the text document in
    // which code complete got requested. For the example we ignore this
    // info and always provide the same completion items.
    if (contextAware) {
      const temp = await getCompleteions(_textDocumentPosition, contextAware);
      return temp;
    }

    return [];
  }
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  // if (item.data === 1) {
  // 	item.detail = 'TypeScript details';
  // 	item.documentation = 'TypeScript documentation';
  // } else if (item.data === 2) {
  // 	item.detail = 'JavaScript details';
  // 	item.documentation = 'JavaScript documentation';
  // }
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

connection.onDocumentSymbol(async (h) => {
  const uri = h.textDocument.uri.replace("file://", "");
  const contextMeta = await findContext(contextAware, uri);

  const data = await contextMeta?.context.getParser(uri);
  if (!data) return [];
  return data.getDocumentSymbols();
});

connection.languages.semanticTokens.on(async (h) => {
  const uri = h.textDocument.uri.replace("file://", "");

  const tokensBuilder = new SemanticTokensBuilder();

  const contextMeta = await findContext(contextAware, uri);

  const data = await contextMeta?.context.getParser(uri);
  if (!data) {
    console.log("no parser for uri found");
  }
  console.log("found semanticTokens", uri);

  await data?.stable;
  data?.buildSemanticTokens(tokensBuilder);

  return tokensBuilder.build();
});

connection.onDocumentLinks(async (event) => {
  const uri = event.textDocument.uri.replace("file://", "");
  const contextMeta = await findContext(contextAware, uri);

  return contextMeta?.context.getDocumentLinks(uri);
});

connection.onReferences(async (event) => {
  return getReferences(event, contextAware);
});

connection.onDefinition(async (event) => {
  return getDefinitions(event, contextAware);
});

connection.onDeclaration(async (event) => {
  return getDeclaration(event, contextAware);
});
