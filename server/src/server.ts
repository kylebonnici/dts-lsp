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
  CodeActionKind,
  WorkspaceDocumentDiagnosticReport,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CodeActionDiagnosticData,
  ContextIssues,
  Issue,
  StandardTypeIssue,
  SyntaxIssue,
  tokenModifiers,
  tokenTypes,
} from "./types";
import {
  findContext,
  findContexts,
  resolveContextFiles,
  toRange,
} from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { getCompletions } from "./getCompletions";
import { getReferences } from "./findReferences";
import { getTokenizedDocumentProvider } from "./providers/tokenizedDocument";
import { getPrepareRenameRequest, getRenameRequest } from "./getRenameRequest";
import { getDefinitions } from "./findDefinitions";
import { getDeclaration } from "./findDeclarations";
import { getCodeActions } from "./getCodeActions";
import { getDocumentFormatting as getDocumentFormatting } from "./getDocumentFormatting";
import { getTypeCompletions } from "./getTypeCompletions";
import { getHover } from "./getHover";
import {
  BindingType,
  getBindingLoader,
} from "./dtsTypes/bindings/bindingLoader";

let contextAware: ContextAware[] = [];
let activeContext: Promise<ContextAware | undefined>;
let activeFileUri: string | undefined;

let debounce = new WeakMap<
  ContextAware,
  { abort: AbortController; promise: Promise<void> }
>();

const isStable = (context: ContextAware) => {
  const d = debounce.get(context);
  if (d?.abort.signal.aborted) return;
  return d?.promise;
};

const allStable = async () => {
  await Promise.all(contextAware.map(isStable));
};

const getAdhocContexts = (settings: Settings) => {
  return contextAware.filter((c) => {
    const settingContext = settings.contexts.find(
      (sc) => sc.dtsFile === c.parser.uri
    );

    return (
      !settingContext ||
      !settingContext.overlays.every((o) => c.overlays.some((oo) => oo === o))
    );
  });
};

const getConfiguredContexts = (settings: Settings) => {
  return contextAware.filter((c) => {
    const settingContext = settings.contexts.find(
      (sc) => sc.dtsFile === c.parser.uri
    );

    return (
      !!settingContext &&
      settingContext.overlays.every((o) => c.overlays.some((oo) => oo === o))
    );
  });
};

const contextFullyOverlaps = async (a: ContextAware, b: ContextAware) => {
  if (a === b) {
    return true;
  }

  const contextAFiles = (await a.getOrderedParsers()).map((p) => p.uri);
  const contextBFiles = (await b.getOrderedParsers()).map((p) => p.uri);

  return contextAFiles.every((f) => contextBFiles.some((ff) => ff === f));
};

const cleanUpAdhocContext = async (context: ContextAware) => {
  const adhocContexts = getAdhocContexts(globalSettings);
  const configContexts = await getConfiguredContexts(globalSettings);
  const adhocContextFiles = await resolveContextFiles(adhocContexts);
  const contextFiles = (await context.getOrderedParsers()).map((p) => p.uri);

  if (contextAware.indexOf(context) === -1) {
    return;
  }

  const sameChart = await Promise.all(
    adhocContextFiles.flatMap((ac) => {
      return [
        ...configContexts,
        ...adhocContexts.filter((a) => a !== ac.context),
      ].map(async (cc) => ({
        context: ac.context,
        same: await contextFullyOverlaps(ac.context, cc),
      }));
    })
  );

  const contextToClean = adhocContextFiles
    .filter(
      (o) =>
        sameChart.some((r) => r.context === o.context && r.same) ||
        (o.context !== context &&
          o.context.parser.uri === context.parser.uri &&
          contextFiles.some((f) => o.files.indexOf(f) !== -1))
    )
    .map((o) => o.context);

  if (contextToClean.length) {
    contextToClean.forEach((c) => {
      debounce.delete(c);
      console.log(
        `cleaning up context with id ${contextAware.indexOf(c)} and uri ${
          c.parser.uri
        }`
      );
    });
    contextAware = contextAware.filter((c) => contextToClean.indexOf(c) === -1);
  }
};

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = true;
let hasWorkspaceFolderCapability = false;

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

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      renameProvider: {
        prepareProvider: true,
      },
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["&", "=", " "],
      },
      diagnosticProvider: {
        interFileDependencies: true,
        workspaceDiagnostics: true,
      },
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.SourceFixAll],
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
      documentFormattingProvider: true,
      hoverProvider: true,
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
    connection.client.register(DidChangeConfigurationNotification.type, {});
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log("Workspace folder change event received.");
    });
  }
});

interface Context {
  includePaths?: string[];
  dtsFile: string;
  overlays: string[];
  bindingType: BindingType;
  zephyrBindings: string[];
}

interface Settings {
  defaultBindingType: BindingType;
  defaultZephyrBindings: string[];
  defaultIncludePaths: string[];
  contexts: Context[];
  preferredContext?: number;
  lockRenameEdits: string[];
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = {
  defaultBindingType: "Zephyr",
  defaultZephyrBindings: [],
  defaultIncludePaths: [],
  contexts: [],
  lockRenameEdits: [],
};
let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<Settings>> = new Map();

let init = false;
const initialSettingsProvided: Promise<void> = new Promise((resolve) => {
  const t = setInterval(() => {
    if (init) {
      resolve();
      clearInterval(t);
    }
  }, 100);
});
connection.onDidChangeConfiguration((change) => {
  init = true;
  if (!change.settings) {
    return;
  }
  console.log("onDidChangeConfiguration", change);
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  }

  const oldSettngs = globalSettings;

  globalSettings = <Settings>{
    ...defaultSettings,
    ...change.settings?.deviceTree,
  };

  let adhocContexts = getAdhocContexts(oldSettngs);

  contextAware = [];

  debounce = new WeakMap<
    ContextAware,
    { abort: AbortController; promise: Promise<void> }
  >();

  globalSettings.contexts.forEach((context, i) => {
    const newContext = new ContextAware(
      context.dtsFile,
      context.includePaths ?? globalSettings.defaultIncludePaths,
      getBindingLoader(
        context.zephyrBindings ?? globalSettings.defaultZephyrBindings,
        context.bindingType ?? globalSettings.defaultBindingType
      ),
      context.overlays
    );
    contextAware.push(newContext);
    console.log(`New context with id ${i} for ${context.dtsFile}`);
  });

  contextAware = [
    ...contextAware,
    ...adhocContexts.map((c, i) => {
      console.log(
        `New context with id ${i + contextAware.length} for ${c.parser.uri}`
      );
      return new ContextAware(
        c.parser.uri,
        globalSettings.defaultIncludePaths,
        getBindingLoader(
          globalSettings.defaultZephyrBindings,
          globalSettings.defaultBindingType
        )
      );
    }),
  ];

  adhocContexts = getAdhocContexts(globalSettings);
  adhocContexts.forEach(cleanUpAdhocContext);
  if (activeFileUri) {
    updateActiveContext(activeFileUri);
  }

  connection.languages.diagnostics.refresh();
});

// Only keep settings for open documents
documents.onDidClose((e) => {
  documentSettings.delete(e.document.uri);
});

connection.languages.diagnostics.on(async (params) => {
  const uri = params.textDocument.uri.replace("file://", "");
  await allStable();
  const context = await activeContext;

  return {
    kind: DocumentDiagnosticReportKind.Full,
    items: context ? await getDiagnostics(context, uri) : [],
  } satisfies DocumentDiagnosticReport;
});

const syntaxIssueToMessage = (issue: SyntaxIssue) => {
  switch (issue) {
    case SyntaxIssue.VALUE:
      return "Expected Value";
    case SyntaxIssue.END_STATEMENT:
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
    case SyntaxIssue.ROOT_NODE_NAME:
      return "Expected root node name";
    case SyntaxIssue.GT_SYM:
      return "Expected '>'";
    case SyntaxIssue.LT_SYM:
      return "Expected '<'";
    case SyntaxIssue.BYTESTRING:
      return "Expected bytes string ";
    case SyntaxIssue.BYTESTRING_EVEN:
      return "Expected two digits in bytestring";
    case SyntaxIssue.DOUBLE_QUOTE:
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
    case SyntaxIssue.MISSING_FORWARD_SLASH_END:
      return "Missing '/'";
    case SyntaxIssue.NO_STATEMENT:
      return "Found ';' without a statement";
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
      return "Missing ':' for label assign";
    case SyntaxIssue.DELETE_INCOMPLETE:
      return "Did you mean /delete-node/ or /delete-property/";
    case SyntaxIssue.DELETE_NODE_INCOMPLETE:
      return "Did you mean /delete-node/";
    case SyntaxIssue.DELETE_PROPERTY_INCOMPLETE:
      return "Did you mean /delete-property/";
    case SyntaxIssue.UNKNOWN:
      return "Unknown syntax";
    case SyntaxIssue.EXPECTED_EXPRESSION:
      return "Expected expression";
    case SyntaxIssue.MISSING_ROUND_CLOSE:
      return 'Expected "("';
    case SyntaxIssue.INVALID_INCLUDE_SYNTAX:
      return "Invalid include Syntax";
    case SyntaxIssue.MISSING_COMMA:
      return 'Missing ","';
    case SyntaxIssue.EXPECTED_IDENTIFIER:
      return "Expected Macro Identifier";
    case SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE:
      return "Expected Macro Identifier or Function like Macro";
    case SyntaxIssue.WHITE_SPACE:
      return "White space is not allowed";
    case SyntaxIssue.EXPECTED_VALUE:
      return "Expected Value";
    case SyntaxIssue.PROPERTY_MUST_BE_IN_NODE:
      return "Properties can only be defined in a node.";
    case SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE:
      return "Properties can only be deleted inside a node.";
  }
};

const contextIssuesToMessage = (issue: Issue<ContextIssues>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case ContextIssues.DUPLICATE_PROPERTY_NAME:
          return `Property "${issue.templateStrings[0]}" is replaced by a later definition.`;
        case ContextIssues.PROPERTY_DOES_NOT_EXIST:
          return "Cannot delete a property before it has been defined";
        case ContextIssues.DUPLICATE_NODE_NAME:
          return "Node name already defined";
        case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
          return `No node with that reference "${issue.templateStrings[0]}" has been defined`;
        case ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH:
          return `No node with name "${issue.templateStrings[0]}" could be found in "/${issue.templateStrings[1]}".`;
        case ContextIssues.LABEL_ALREADY_IN_USE:
          return `Label name "${issue.templateStrings[0]}" already defined`;
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
      return "No node with that reference has been defined";
    case ContextIssues.LABEL_ALREADY_IN_USE:
      return "Label already defined here";
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
          return `INTRO should be empty`;
        case StandardTypeIssue.EXPECTED_ONE:
          return `INTRO can only be assigned one value`;
        case StandardTypeIssue.EXPECTED_U32:
          return `INTRO should be assigned a U32`;
        case StandardTypeIssue.EXPECTED_U64:
          return `INTRO should be assigned a U64`;
        case StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY:
          return `INTRO should be assigned a 'property encoded array'`;
        case StandardTypeIssue.EXPECTED_STRING:
          return `INTRO should be assigned a string`;
        case StandardTypeIssue.EXPECTED_STRINGLIST:
          return `INTRO should be assigned a string list`;
        case StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH:
          return `INTRO expects ${issue.templateStrings[1]} values`;
        case StandardTypeIssue.REQUIRED:
          return `INTRO is required.`;
        case StandardTypeIssue.OMITTED:
          return `INTRO should be omitted`;
        case StandardTypeIssue.EXPECTED_PAIR:
          return `INTRO must have pair`;
        case StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE:
          return `INTRO first value must match node address`;
        case StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU:
          return `INTRO should be 'cpu'`;
        case StandardTypeIssue.EXPECTED_DEVICE_TYPE_MEMORY:
          return `INTRO should be 'memory'`;
        case StandardTypeIssue.DEPRECATED:
          return `INTRO is deprecated and should not be used'`;
        case StandardTypeIssue.IGNORED:
          return `INTRO ${issue.templateStrings[1]}'`;
        case StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE:
          return `INTRO value must be unique in the entire device tree`;
        case StandardTypeIssue.CELL_MISS_MATCH:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE:
          return `INTRO requires property "${issue.templateStrings[1]}" in node path "${issue.templateStrings[2]}"`;
        case StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND:
          return `Unable to resolve interrupt parent node`;
        case StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH:
          return `INTRO expects ${issue.templateStrings[1]} interrupts cells`;
        case StandardTypeIssue.MAP_ENTRY_INCOMPLETE:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.NODE_DISABLED:
          return "Node is diabled";
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE:
          return `Unable to resolve handel`;
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PATH:
          return `Unable to find "${issue.templateStrings[0]}" in ${issue.templateStrings[1]}`;
        case StandardTypeIssue.EXPECTED_VALUE:
          return issue.templateStrings[0];
      }
    })
    .join(" or ")
    .replace("INTRO", `Property "${issue.templateStrings[0]}"`)
    .replaceAll("INTRO ", "");
};

const standardTypeToLinkedMessage = (issue: StandardTypeIssue) => {
  switch (issue) {
    case StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE:
      return `Nodes`;
    case StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH:
      return "Property";
    case StandardTypeIssue.IGNORED:
      return "Ignored reason";
    case StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE:
      return "Conflicting Properties";
    case StandardTypeIssue.EXPECTED_ONE:
      return "Additional value";
    case StandardTypeIssue.REQUIRED:
      return `Nodes`;
    default:
      return `TODO`;
  }
};

// // The content of a text document has changed. This event is emitted
// // when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
  console.log("onDidChangeContent");
  const uri = change.document.uri.replace("file://", "");

  getTokenizedDocumentProvider().renewLexer(uri, change.document.getText());

  await initialSettingsProvided;

  const contexts = await findContexts(contextAware, uri);

  if (!contexts.length) {
    const newContext = new ContextAware(
      uri,
      globalSettings.defaultIncludePaths,
      getBindingLoader(
        globalSettings.defaultZephyrBindings,
        globalSettings.defaultBindingType
      )
    );
    console.log(`New adhoc context with id ${newContext.id} for ${uri}`);
    contextAware.push(newContext);
    await newContext.parser.stable;
    cleanUpAdhocContext(newContext);
    updateActiveContext(uri);
  } else {
    contexts.forEach((context) => {
      debounce.get(context.context)?.abort.abort();
      const abort = new AbortController();
      const promise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          if (abort.signal.aborted) {
            resolve();
            return;
          }
          const t = performance.now();
          issueCache.delete(context.context);
          await context.context.revaluate(uri);
          resolve();
          console.log("revaluate", performance.now() - t);
        }, 50);
      });

      debounce.set(context.context, { abort, promise });
    });
  }
});

connection.languages.diagnostics.onWorkspace(async () => {
  await allStable();
  const context = await activeContext;
  if (!context) {
    return {
      items: [],
    };
  }

  const orderedParsers = await context.getOrderedParsers();
  const activeContextItems = await Promise.all(
    orderedParsers.map(async (parser) => {
      const items = await getDiagnostics(context, parser.uri);
      return {
        uri: `file://${parser.uri}`,
        kind: DocumentDiagnosticReportKind.Full,
        items,
        version: documents.get(`file://${parser.uri}`)?.version ?? null,
      } satisfies WorkspaceDocumentDiagnosticReport;
    })
  );

  const otherContextItems = await Promise.all(
    contextAware
      .filter((c) => c !== context)
      .flatMap(async (c) => {
        const orderedParsers = await c.getOrderedParsers();
        return await Promise.all(
          orderedParsers.flatMap(async (parser) => {
            return {
              uri: `file://${parser.uri}`,
              kind: DocumentDiagnosticReportKind.Full,
              items: [],
              version: documents.get(`file://${parser.uri}`)?.version ?? null,
            } satisfies WorkspaceDocumentDiagnosticReport;
          })
        );
      })
  );

  return {
    items: [...activeContextItems, ...otherContextItems.flat()],
  };
});

const issueCache = new WeakMap<ContextAware, Map<string, Diagnostic[]>>();

async function getDiagnostics(
  context: ContextAware,
  uri: string
): Promise<Diagnostic[]> {
  const t = performance.now();

  const contextIssue = issueCache.get(context);
  if (contextIssue) {
    const uriIssues = contextIssue.get(uri);
    if (uriIssues) {
      return uriIssues;
    }
  } else {
    issueCache.set(context, new Map());
  }

  try {
    const diagnostics: Diagnostic[] = [];

    const d = debounce.get(context);
    if (d?.abort.signal.aborted) return [];
    await d?.promise;

    const parser = await context.getParser(uri);
    parser?.issues.forEach((issue) => {
      const diagnostic: Diagnostic = {
        severity: issue.severity,
        range: toRange(issue.astElement),
        message: issue.issues
          ? issue.issues.map(syntaxIssueToMessage).join(" or ")
          : "",
        source: "device tree",
        data: {
          firstToken: {
            pos: issue.astElement.firstToken.pos,
            tokens: issue.astElement.firstToken.tokens,
            value: issue.astElement.firstToken.value,
          },
          lastToken: {
            pos: issue.astElement.lastToken.pos,
            tokens: issue.astElement.lastToken.tokens,
            value: issue.astElement.lastToken.value,
          },
          issues: issue.issues,
        } as CodeActionDiagnosticData,
      };
      diagnostics.push(diagnostic);
    });

    const contextIssues = (await context.getContextIssues()) ?? [];
    contextIssues
      .filter((issue) => issue.astElement.uri === uri)
      .forEach((issue) => {
        const diagnostic: Diagnostic = {
          severity: issue.severity,
          range: toRange(issue.astElement),
          message: contextIssuesToMessage(issue),
          source: "device tree",
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

    const runtime = await context.getRuntime();
    runtime?.typesIssues
      .filter((issue) => issue.astElement.uri === uri)
      .forEach((issue) => {
        const diagnostic: Diagnostic = {
          severity: issue.severity,
          range: toRange(issue.astElement),
          message: standardTypeIssueIssuesToMessage(issue),
          relatedInformation: [
            ...issue.linkedTo.map((element) => ({
              message: issue.issues
                .map(standardTypeToLinkedMessage)
                .join(" or "),
              location: {
                uri: `file://${element.uri!}`,
                range: toRange(element),
              },
            })),
          ],
          source: "device tree",
          tags: issue.tags,
        };
        diagnostics.push(diagnostic);
      });

    console.log("diagnostics", uri, performance.now() - t);
    issueCache.get(context)?.set(uri, diagnostics);
    return diagnostics;
  } catch (e) {
    console.error(e);
    throw e;
  }
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

    await allStable();

    if (contextAware) {
      return [
        ...(await getCompletions(
          _textDocumentPosition,
          contextAware,
          globalSettings.preferredContext
        )),
        ...(await getTypeCompletions(
          _textDocumentPosition,
          contextAware,
          globalSettings.preferredContext
        )),
      ];
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

const updateActiveContext = async (uri: string) => {
  activeFileUri = uri;
  await allStable();
  const oldContext = await activeContext;
  activeContext = findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  ).then((r) => r?.context);

  const context = await activeContext;
  if (oldContext !== context) {
    console.log(
      `(id: ${context?.id ?? -1}) activeContext:`,
      context?.parser.uri
    );
    contextAware.forEach((c, i) => {
      console.log(`Context with id ${c.id} for ${c.parser.uri}`);
    });
  }
};

connection.onDocumentSymbol(async (h) => {
  const uri = h.textDocument.uri.replace("file://", "");
  updateActiveContext(uri);

  const context = await activeContext;
  if (context) {
    const d = debounce.get(context);
    if (d?.abort.signal.aborted) return [];
    await d?.promise;
  }

  const data = await context?.getParser(uri);
  if (!data) return [];
  return data.getDocumentSymbols();
});

connection.languages.semanticTokens.on(async (h) => {
  const uri = h.textDocument.uri.replace("file://", "");

  const tokensBuilder = new SemanticTokensBuilder();

  await allStable();
  const contextMeta = await findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  );

  const data = await contextMeta?.context.getParser(uri);

  if (!data) {
    return { data: [] };
  }
  if (contextMeta) {
    const d = debounce.get(contextMeta.context);
    if (d?.abort.signal.aborted) return { data: [] };
    await d?.promise;
  }

  data?.buildSemanticTokens(tokensBuilder);

  return tokensBuilder.build();
});

connection.onDocumentLinks(async (event) => {
  const uri = event.textDocument.uri.replace("file://", "");
  await allStable();
  const contextMeta = await findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  );
  if (contextMeta) {
    const d = debounce.get(contextMeta.context);
    if (d?.abort.signal.aborted) return [];
    await d?.promise;
  }

  return contextMeta?.context.getDocumentLinks(uri);
});

connection.onPrepareRename(async (event) => {
  await allStable();
  return getPrepareRenameRequest(
    event,
    contextAware,
    globalSettings.lockRenameEdits,
    globalSettings.preferredContext
  );
});

connection.onRenameRequest(async (event) => {
  await allStable();
  return getRenameRequest(event, contextAware, globalSettings.preferredContext);
});

connection.onReferences(async (event) => {
  await allStable();
  return getReferences(event, contextAware, globalSettings.preferredContext);
});

connection.onDefinition(async (event) => {
  await allStable();
  return getDefinitions(event, contextAware, globalSettings.preferredContext);
});

connection.onDeclaration(async (event) => {
  await allStable();
  return getDeclaration(event, contextAware, globalSettings.preferredContext);
});

connection.onCodeAction((event) => {
  return getCodeActions(event);
});

connection.onDocumentFormatting(async (event) => {
  await allStable();
  return getDocumentFormatting(event, contextAware);
});

connection.onHover(async (event) => {
  await allStable();
  return (
    await getHover(event, contextAware, globalSettings.preferredContext)
  ).at(0);
});
