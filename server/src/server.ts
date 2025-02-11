#!/usr/bin/env node
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
  SemanticTokensBuilder,
  CodeActionKind,
  WorkspaceDocumentDiagnosticReport,
  WorkspaceSymbol,
  DiagnosticSeverity,
  Range,
  Position,
  PublishDiagnosticsParams,
  Location,
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
import { getDocumentFormatting } from "./getDocumentFormatting";
import { getTypeCompletions } from "./getTypeCompletions";
import { getHover } from "./getHover";
import {
  BindingType,
  getBindingLoader,
} from "./dtsTypes/bindings/bindingLoader";
import { getFoldingRanges } from "./foldingRanges";
import { typeDefinition } from "./typeDefinition";
import { resolve } from "path";

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
  return Promise.all([d?.promise, context.getRuntime()]);
};

const allStable = async () => {
  await initialSettingsProvided;
  await Promise.all(contextAware.map(isStable));
};

const getAdhocContexts = (settings: Settings) => {
  const configuredContexts = getConfiguredContexts(settings);
  return contextAware.filter((c) => !configuredContexts.some((cc) => cc === c));
};

const getConfiguredContexts = (settings: Settings) => {
  return contextAware.filter((c) => {
    const settingContext = settings.contexts?.find(
      (sc) => sc.dtsFile === c.parser.uri
    );

    return (
      !!settingContext &&
      settingContext.overlays?.every((o) => c.overlays.some((oo) => oo === o))
    );
  });
};

const contextFullyOverlaps = async (a: ContextAware, b: ContextAware) => {
  if (a === b) {
    return true;
  }

  const contextAIncludes = (await a.getAllParsers()).flatMap(
    (p) => p.cPreprocessorParser.dtsIncludes
  );
  const contextBIncludes = (await b.getAllParsers()).flatMap(
    (p) => p.cPreprocessorParser.dtsIncludes
  );

  return contextAIncludes.length
    ? contextAIncludes.every((f) =>
        contextBIncludes.some(
          (ff) =>
            ff.reolvedPath === f.reolvedPath &&
            ff.firstToken.pos.col === f.firstToken.pos.col &&
            ff.firstToken.pos.len === f.firstToken.pos.len &&
            ff.firstToken.pos.line === f.firstToken.pos.line &&
            ff.lastToken.pos.col === f.lastToken.pos.col &&
            ff.lastToken.pos.len === f.lastToken.pos.len &&
            ff.lastToken.pos.line === f.lastToken.pos.line
        )
      )
    : b.getContextFiles().some((ff) => ff === a.parser.uri);
};

const cleanUpAdHocContext = async (context: ContextAware) => {
  const adhocContexts = getAdhocContexts(globalSettings);
  const configContexts = await getConfiguredContexts(globalSettings);
  const adhocContextFiles = await resolveContextFiles(adhocContexts);

  if (contextAware.indexOf(context) === -1) {
    return;
  }

  const contextFiles = [
    ...context.overlayParsers.map((p) => p.uri),
    context.parser.uri,
    ...context.parser.includes.map((p) => p.reolvedPath),
  ];

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
          contextFiles.some((f) => f && o.files.indexOf(f) !== -1))
    )
    .map((o) => o.context);

  if (contextToClean.length) {
    contextToClean.forEach((c) => {
      clearWorkspaceDiagnostics(c);
      debounce.delete(c);
      console.log(
        `cleaning up context with ID ${c.name} and uri ${c.parser.uri}`
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
let hasDiagnosticRefreshCapability = false;

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
  hasDiagnosticRefreshCapability =
    !!capabilities.workspace?.diagnostics?.refreshSupport;

  const result: InitializeResult = {
    capabilities: {
      typeDefinitionProvider: true,
      workspaceSymbolProvider: true,
      textDocumentSync: TextDocumentSyncKind.Incremental,
      renameProvider: {
        prepareProvider: true,
      },
      completionProvider: {
        resolveProvider: true,
        triggerCharacters: ["&", "=", " "],
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
      foldingRangeProvider: true,
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
      connection.console.log("Workspace folder change event received");
    });
  }
});

interface Context {
  ctxName: string | number;
  cwd?: string;
  includePaths?: string[];
  dtsFile: string;
  overlays?: string[];
  bindingType?: BindingType;
  zephyrBindings?: string[];
  deviceOrgTreeBindings?: string[];
  deviceOrgBindingsMetaSchema?: string[];
}

interface Settings {
  cwd?: string;
  defaultBindingType?: BindingType;
  defaultZephyrBindings?: string[];
  defaultDeviceOrgTreeBindings?: string[];
  defaultDeviceOrgBindingsMetaSchema?: string[];
  defaultIncludePaths?: string[];
  contexts?: Context[];
  preferredContext?: string | number;
  lockRenameEdits?: string[];
  autoChangeContext?: boolean;
  allowAdhocContexts?: boolean;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: Settings = {
  defaultBindingType: "Zephyr",
  defaultZephyrBindings: [],
  defaultIncludePaths: [],
  defaultDeviceOrgBindingsMetaSchema: [],
  defaultDeviceOrgTreeBindings: [],
  contexts: [],
  lockRenameEdits: [],
  allowAdhocContexts: true,
  autoChangeContext: true,
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
  console.log("Configuration changed", change);
  if (hasConfigurationCapability) {
    // Reset all cached document settings
    documentSettings.clear();
  }

  const oldSettngs = globalSettings;

  globalSettings = <Settings>{
    ...defaultSettings,
    ...change.settings?.devicetree,
  };

  // resolve context paths defaults
  globalSettings.contexts?.forEach((context, i) => {
    if (context.cwd || globalSettings.cwd) {
      const cwd = (context.cwd ?? globalSettings.cwd) as string;
      context.includePaths ??= globalSettings.defaultIncludePaths;
      context.zephyrBindings ??= globalSettings.defaultIncludePaths;
      context.bindingType ??= globalSettings.defaultBindingType;
      context.deviceOrgTreeBindings ??=
        globalSettings.defaultDeviceOrgTreeBindings;
      context.deviceOrgBindingsMetaSchema ??=
        globalSettings.defaultDeviceOrgBindingsMetaSchema;

      if (
        cwd &&
        context.bindingType === "Zephyr" &&
        (!context.zephyrBindings || context.zephyrBindings.length === 0)
      ) {
        context.zephyrBindings = ["./zephyr/dts/bindings"];
      }

      context.zephyrBindings = context.zephyrBindings?.map((i) =>
        resolve(cwd, i)
      );
      context.deviceOrgTreeBindings = context.deviceOrgTreeBindings?.map((i) =>
        resolve(cwd, i)
      );
      context.deviceOrgBindingsMetaSchema =
        context.deviceOrgBindingsMetaSchema?.map((i) => resolve(cwd, i));
      context.includePaths = context.includePaths?.map((i) => resolve(cwd, i));
      context.dtsFile = resolve(cwd, context.dtsFile);
    }
  });

  let adhocContexts = getAdhocContexts(oldSettngs);

  contextAware = [];

  debounce = new WeakMap<
    ContextAware,
    { abort: AbortController; promise: Promise<void> }
  >();

  globalSettings.contexts?.forEach((context, i) => {
    const bindingType = context.bindingType;

    const newContext = new ContextAware(
      context.dtsFile,
      context.includePaths ?? [],
      bindingType
        ? getBindingLoader(
            {
              zephyrBindings: context.zephyrBindings ?? [],
              deviceOrgBindingsMetaSchema:
                context.deviceOrgBindingsMetaSchema ?? [],
              deviceOrgTreeBindings: context.deviceOrgTreeBindings ?? [],
            },
            bindingType
          )
        : undefined,
      context.overlays,
      context.ctxName
    );
    contextAware.push(newContext);
    console.log(
      `New context with ID ${newContext.name} for ${context.dtsFile}`
    );
  });

  // resolve global with cwd
  const resolvedGlobal = resolveGlobal();

  contextAware = [
    ...contextAware,
    ...adhocContexts.map((c) => {
      const bindingType = globalSettings.defaultBindingType;
      const context = new ContextAware(
        c.parser.uri,
        resolvedGlobal.defaultIncludePaths,
        bindingType
          ? getBindingLoader(
              {
                zephyrBindings: resolvedGlobal.defaultZephyrBindings,
                deviceOrgBindingsMetaSchema:
                  resolvedGlobal.defaultDeviceOrgBindingsMetaSchema,
                deviceOrgTreeBindings:
                  resolvedGlobal.defaultDeviceOrgTreeBindings,
              },
              bindingType
            )
          : undefined
      );
      console.log(`New context with ID ${context.name} for ${c.parser.uri}`);
      return context;
    }),
  ];

  adhocContexts = getAdhocContexts(globalSettings);
  adhocContexts.forEach(cleanUpAdHocContext);
  if (activeFileUri) {
    updateActiveContext(activeFileUri, true);
  }

  if (hasDiagnosticRefreshCapability) {
    connection.languages.diagnostics.refresh();
  }
});

const resolveGlobal = () => {
  // resolve global with cwd
  const defaultIncludePaths = (globalSettings.defaultIncludePaths ?? []).map(
    (i) => {
      if (globalSettings.cwd) {
        return resolve(globalSettings.cwd, i);
      }

      return i;
    }
  );

  if (
    globalSettings.cwd &&
    globalSettings.defaultBindingType === "Zephyr" &&
    !globalSettings.defaultZephyrBindings
  ) {
    globalSettings.defaultZephyrBindings = ["./zephyr/dts/bindings"];
  }

  const defaultZephyrBindings = (
    globalSettings.defaultZephyrBindings ?? []
  ).map((i) => {
    if (globalSettings.cwd) {
      return resolve(globalSettings.cwd, i);
    }

    return i;
  });

  const defaultDeviceOrgBindingsMetaSchema = (
    globalSettings.defaultDeviceOrgBindingsMetaSchema ?? []
  ).map((i) => {
    if (globalSettings.cwd) {
      return resolve(globalSettings.cwd, i);
    }

    return i;
  });

  const defaultDeviceOrgTreeBindings = (
    globalSettings.defaultDeviceOrgTreeBindings ?? []
  ).map((i) => {
    if (globalSettings.cwd) {
      return resolve(globalSettings.cwd, i);
    }

    return i;
  });

  return {
    defaultIncludePaths,
    defaultZephyrBindings,
    defaultDeviceOrgBindingsMetaSchema,
    defaultDeviceOrgTreeBindings,
  };
};

// Only keep settings for open documents
documents.onDidClose(async (e) => {
  const uri = e.document.uri.replace("file://", "");
  const context = await activeContext;
  const fileInActiveContext =
    context && context.getContextFiles().some((f) => f === uri);
  if (!fileInActiveContext) {
    connection.sendDiagnostics({
      uri: e.document.uri,
      version: documents.get(e.document.uri)?.version,
      diagnostics: [],
    });
  }

  documentSettings.delete(e.document.uri);
});

documents.onDidOpen(async (e) => {
  await allStable();
  const context = await activeContext;

  if (!context) {
    connection.sendDiagnostics({
      uri: e.document.uri,
      version: documents.get(e.document.uri)?.version,
      diagnostics: [
        {
          severity: DiagnosticSeverity.Warning,
          range: Range.create(Position.create(0, 0), Position.create(0, 0)),
          message: "File has no context",
          source: "devicetree",
        },
      ],
    });
  }
});

const syntaxIssueToMessage = (issue: SyntaxIssue) => {
  switch (issue) {
    case SyntaxIssue.VALUE:
      return "Expected value";
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
    case SyntaxIssue.GT_SYM:
      return "Expected '>'";
    case SyntaxIssue.LT_SYM:
      return "Expected '<'";
    case SyntaxIssue.DOUBLE_QUOTE:
      return "Expected '\"'";
    case SyntaxIssue.SINGLE_QUOTE:
      return 'Expected "\'"\\';
    case SyntaxIssue.LABEL_ASSIGN_MISSING_COLON:
      return "Missing ':'";
    case SyntaxIssue.MISSING_FORWARD_SLASH_END:
      return "Missing '/'";
    case SyntaxIssue.MISSING_ROUND_CLOSE:
      return 'Expected ")"';
    case SyntaxIssue.MISSING_COMMA:
      return 'Missing ","';
    case SyntaxIssue.PROPERTY_NAME:
      return "Expected property name";
    case SyntaxIssue.NODE_NAME:
      return "Expected node name";
    case SyntaxIssue.NODE_ADDRESS:
      return "Expected node address";
    case SyntaxIssue.NODE_PATH:
      return "Expected node path";
    case SyntaxIssue.NODE_REF:
      return "Expected node reference";
    case SyntaxIssue.ROOT_NODE_NAME:
      return "Expected root node name";
    case SyntaxIssue.BYTESTRING:
      return "Expected bytestring";
    case SyntaxIssue.BYTESTRING_EVEN:
      return "Expected two digits for each byte in bytestring";
    case SyntaxIssue.BYTESTRING_HEX:
      return "Hex values are not allowed";
    case SyntaxIssue.LABEL_NAME:
      return "Expected label name";
    case SyntaxIssue.FORWARD_SLASH_START_PATH:
      return "Expected '/' at the start of a node path";
    case SyntaxIssue.NO_STATEMENT:
      return "Found ';' without a statement";
    case SyntaxIssue.DELETE_INCOMPLETE:
      return "Did you mean /delete-node/ or /delete-property/?";
    case SyntaxIssue.DELETE_NODE_INCOMPLETE:
      return "Did you mean /delete-node/?";
    case SyntaxIssue.DELETE_PROPERTY_INCOMPLETE:
      return "Did you mean /delete-property/?";
    case SyntaxIssue.UNKNOWN:
      return "Unknown syntax";
    case SyntaxIssue.EXPECTED_EXPRESSION:
      return "Expected expression";
    case SyntaxIssue.EXPECTED_IDENTIFIER:
      return "Expected macro identifier";
    case SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE:
      return "Expected macro identifier or function like macro";
    case SyntaxIssue.WHITE_SPACE:
      return "White space is not allowed";
    case SyntaxIssue.PROPERTY_MUST_BE_IN_NODE:
      return "Properties can only be defined in a node";
    case SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE:
      return "Properties can only be deleted inside a node";
    case SyntaxIssue.UNABLE_TO_RESOLVE_INCLUDE:
      return "Unable to resolve include";
    case SyntaxIssue.EXPECTED_START_ADDRESS:
      return "Expedted start address";
    case SyntaxIssue.EXPECTED_END_ADDRESS:
      return "Expected end address";
    case SyntaxIssue.EXPECTED_BITS_SIZE:
    case SyntaxIssue.INVALID_BITS_SIZE:
      return "Expected 8|16|32|64";
    case SyntaxIssue.BITS_NON_OFFICIAL_SYNATX:
      return "This syntax is not officially part of the DTS V0.4 standard";
  }
};

const contextIssuesToMessage = (issue: Issue<ContextIssues>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case ContextIssues.DUPLICATE_PROPERTY_NAME:
          return `Property "${issue.templateStrings[0]}" is replaced by a later definition`;
        case ContextIssues.PROPERTY_DOES_NOT_EXIST:
          return "Cannot delete a property before it has been defined";
        case ContextIssues.DUPLICATE_NODE_NAME:
          return "Node name already defined";
        case ContextIssues.NODE_DOES_NOT_EXIST:
          return "Cannot delete a node before it has been defined";
        case ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE:
          return `No node with that reference "${issue.templateStrings[0]}" has been defined`;
        case ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH:
          return `No node with name "${issue.templateStrings[0]}" could be found in "/${issue.templateStrings[1]}".`;
        case ContextIssues.LABEL_ALREADY_IN_USE:
          return `Label name "${issue.templateStrings[0]}" already defined`;
        case ContextIssues.DELETE_PROPERTY:
          return `Property "${issue.templateStrings[0]}" was deleted`;
        case ContextIssues.DELETE_NODE:
          return `Node "${issue.templateStrings[0]}" was deleted`;
      }
    })
    .join(" or ");
};

const contextIssuesToLinkedMessage = (issue: ContextIssues) => {
  switch (issue) {
    case ContextIssues.DUPLICATE_PROPERTY_NAME:
      return "Property name already defined.";
    case ContextIssues.DUPLICATE_NODE_NAME:
      return "Defined here";
    case ContextIssues.LABEL_ALREADY_IN_USE:
      return "Defined here";
    case ContextIssues.DELETE_NODE:
    case ContextIssues.DELETE_PROPERTY:
      return "Deleted here";
    default:
      return "TODO";
  }
};

const standardTypeIssueIssuesToMessage = (issue: Issue<StandardTypeIssue>) => {
  return issue.issues
    .map((_issue) => {
      switch (_issue) {
        case StandardTypeIssue.EXPECTED_ENUM:
          return `Only these value are allowed ${issue.templateStrings[0]}`;
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
          return `INTRO is required`;
        case StandardTypeIssue.OMITTED:
          return `INTRO should be omitted`;
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
          return `INTRO value must be unique in the entire Devicetree`;
        case StandardTypeIssue.CELL_MISS_MATCH:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE:
          return `INTRO requires property "${issue.templateStrings[1]}" in node path "${issue.templateStrings[2]}"`;
        case StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND:
          return `Unable to resolve interrupt parent node`;
        case StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH:
          return `INTRO expects ${issue.templateStrings[1]} interrupt cells`;
        case StandardTypeIssue.MAP_ENTRY_INCOMPLETE:
          return `INTRO should have format ${issue.templateStrings[1]}`;
        case StandardTypeIssue.NODE_DISABLED:
          return "Node is disabled";
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE:
          return `Unable to resolve handle`;
        case StandardTypeIssue.UNABLE_TO_RESOLVE_PATH:
          return `Unable to find "${issue.templateStrings[0]}" in ${issue.templateStrings[1]}`;
        case StandardTypeIssue.EXPECTED_VALUE:
          return issue.templateStrings[0];
        case StandardTypeIssue.DEVICETREE_ORG_BINDINGS:
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
    case StandardTypeIssue.REQUIRED:
      return `Node`;
    case StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH:
      return "Property";
    case StandardTypeIssue.IGNORED:
      return "Ignored reason";
    case StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE:
      return "Conflicting properties";
    case StandardTypeIssue.EXPECTED_ONE:
      return "Additional value";
    case StandardTypeIssue.NODE_DISABLED:
      return "Disabled by";
    default:
      return `TODO`;
  }
};

// // The content of a text document has changed. This event is emitted
// // when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
  console.log("Content changed");
  const uri = change.document.uri.replace("file://", "");

  const text = change.document.getText();
  const tokenProvider = getTokenizedDocumentProvider();
  if (!tokenProvider.needsRenew(uri, text)) return;

  tokenProvider.renewLexer(uri, text);

  await initialSettingsProvided;

  const contexts = await findContexts(contextAware, uri);

  if (!contexts.length) {
    if (globalSettings.allowAdhocContexts === false) {
      return;
    }

    const bindingType = globalSettings.defaultBindingType;
    const resolvedGlobal = resolveGlobal();
    const newContext = new ContextAware(
      uri,
      resolvedGlobal.defaultIncludePaths,
      bindingType
        ? getBindingLoader(
            {
              zephyrBindings: resolvedGlobal.defaultZephyrBindings,
              deviceOrgBindingsMetaSchema:
                resolvedGlobal.defaultDeviceOrgBindingsMetaSchema,
              deviceOrgTreeBindings:
                resolvedGlobal.defaultDeviceOrgTreeBindings,
            },
            bindingType
          )
        : undefined
    );
    console.log(`New ad hoc context with ID ${newContext.name} for ${uri}`);
    contextAware.push(newContext);
    updateActiveContext(uri);
    await newContext.parser.stable;
    cleanUpAdHocContext(newContext);
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
          const itemsToClear = generateClearWorkspaceDiagnostics(
            context.context
          );
          await context.context.reevaluate(uri);
          clearWorkspaceDiagnostics(context.context, itemsToClear);
          reportWorkspaceDiagnostics(context.context).then((d) => {
            d.items
              .map(
                (i) =>
                  ({
                    uri: i.uri,
                    version: i.version ?? undefined,
                    diagnostics: i.items,
                  } satisfies PublishDiagnosticsParams)
              )
              .forEach((ii) => {
                connection.sendDiagnostics(ii);
              });
          });
          resolve();
          console.log("reevaluate", performance.now() - t);
        }, 50);
      });

      debounce.set(context.context, { abort, promise });
    });
  }
});

const generateClearWorkspaceDiagnostics = (context: ContextAware) =>
  context.getContextFiles().map(
    (file) =>
      ({
        uri: `file://${file}`,
        version: documents.get(`file://${file}`)?.version,
        diagnostics: [],
      } satisfies PublishDiagnosticsParams)
  );

const clearWorkspaceDiagnostics = (
  context: ContextAware,
  items: PublishDiagnosticsParams[] = generateClearWorkspaceDiagnostics(context)
) => {
  items.forEach((item) => {
    connection.sendDiagnostics({
      uri: item.uri,
      version: documents.get(item.uri)?.version,
      diagnostics: [],
    } satisfies PublishDiagnosticsParams);
  });
};

const reportWorkspaceDiagnostics = async (context: ContextAware) => {
  await context.stable();
  const activeContextItems = await Promise.all(
    context.getContextFiles().map(async (file) => {
      const items = await getDiagnostics(context, file);
      return {
        uri: `file://${file}`,
        kind: DocumentDiagnosticReportKind.Full,
        items,
        version: documents.get(`file://${file}`)?.version ?? null,
      } satisfies WorkspaceDocumentDiagnosticReport;
    })
  );

  return {
    items: [...activeContextItems],
  };
};

connection.languages.diagnostics.onWorkspace(async () => {
  await allStable();
  const context = await activeContext;

  if (!context) {
    return {
      items: [],
    };
  }

  return reportWorkspaceDiagnostics(context);
});

async function getDiagnostics(
  context: ContextAware,
  uri: string
): Promise<Diagnostic[]> {
  const t = performance.now();

  try {
    const diagnostics: Diagnostic[] = [];

    if (!context.isInContext(uri)) {
      return [
        {
          severity: DiagnosticSeverity.Warning,
          range: Range.create(Position.create(0, 0), Position.create(0, 0)),
          message: "File not in use by the active context",
          source: "devicetree",
        },
      ];
    }

    context.parser.issues
      .filter((issue) => issue.astElement.uri === uri)
      .forEach((issue) => {
        const diagnostic: Diagnostic = {
          severity: issue.severity,
          range: toRange(issue.astElement),
          message: issue.issues
            ? issue.issues.map(syntaxIssueToMessage).join(" or ")
            : "",
          source: "devicetree",
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
            issues: {
              type: "SyntaxIssue",
              items: issue.issues,
              edit: issue.edit,
              codeActionTitle: issue.codeActionTitle,
            },
          } satisfies CodeActionDiagnosticData,
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
          source: "devicetree",
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
          source: "devicetree",
          tags: issue.tags,
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
            issues: {
              type: "StandardTypeIssue",
              items: issue.issues,
              edit: issue.edit,
              codeActionTitle: issue.codeActionTitle,
            },
          } satisfies CodeActionDiagnosticData,
        };
        diagnostics.push(diagnostic);
      });

    console.log("diagnostics", uri, performance.now() - t);
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
  return item;
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();

const updateActiveContext = async (uri: string, force = false) => {
  if (!force && globalSettings.autoChangeContext === false) {
    return;
  }

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
    if (oldContext) {
      clearWorkspaceDiagnostics(oldContext);
    }
    if (context) {
      reportWorkspaceDiagnostics(context).then((d) => {
        d.items
          .map(
            (i) =>
              ({
                uri: i.uri,
                version: i.version ?? undefined,
                diagnostics: i.items,
              } satisfies PublishDiagnosticsParams)
          )
          .forEach((ii) => {
            connection.sendDiagnostics(ii);
          });
      });
    }
    console.log(
      `(ID: ${context?.name ?? -1}) activeContext:`,
      context?.parser.uri
    );
    contextAware.forEach((c, i) => {
      console.log(`Context with ID ${c.name} for ${c.parser.uri}`);
    });
  }
};

connection.onDocumentSymbol(async (h) => {
  await allStable();
  const uri = h.textDocument.uri.replace("file://", "");
  await updateActiveContext(uri);

  const context = await activeContext;

  const data = await context?.parser;
  if (!data) return [];
  return data.getDocumentSymbols(uri);
});

connection.onWorkspaceSymbol(async () => {
  await allStable();
  const context = await activeContext;
  if (!context) return [];

  return (await context.getAllParsers()).flatMap((p) =>
    p.getWorkspaceSymbols()
  ) satisfies WorkspaceSymbol[];
});

connection.languages.semanticTokens.on(async (h) => {
  await allStable();
  const uri = h.textDocument.uri.replace("file://", "");
  await updateActiveContext(uri);

  const tokensBuilder = new SemanticTokensBuilder();

  const contextMeta = await findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  );

  const isInContext = contextMeta?.context.isInContext(uri);
  if (!contextMeta || !isInContext) {
    return { data: [] };
  }

  contextMeta.context.parser.buildSemanticTokens(tokensBuilder, uri);

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

  return contextMeta?.context.getDocumentLinks(uri);
});

connection.onPrepareRename(async (event) => {
  await allStable();
  return getPrepareRenameRequest(
    event,
    contextAware,
    globalSettings.lockRenameEdits ?? [],
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
  const uri = event.textDocument.uri.replace("file://", "");
  await allStable();

  const contextMeta = await findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  );

  const documentLinkDefinition =
    (await contextMeta?.context.getDocumentLinks(uri, event.position))
      ?.filter((docLink) => docLink.target)
      .map((docLink) => Location.create(docLink.target!, docLink.range)) ?? [];

  if (documentLinkDefinition.length) return documentLinkDefinition;

  return getDefinitions(event, contextAware, globalSettings.preferredContext);
});

connection.onDeclaration(async (event) => {
  await allStable();
  return getDeclaration(event, contextAware, globalSettings.preferredContext);
});

connection.onCodeAction(async (event) => {
  return getCodeActions(event);
});

connection.onDocumentFormatting(async (event) => {
  const uri = event.textDocument.uri.replace("file://", "");
  await allStable();
  const contextMeta = await findContext(
    contextAware,
    uri,
    globalSettings.preferredContext
  );
  if (!contextMeta) {
    return [];
  }

  return getDocumentFormatting(event, contextMeta.context);
});

connection.onHover(async (event) => {
  await allStable();
  return (
    await getHover(event, contextAware, globalSettings.preferredContext)
  ).at(0);
});

connection.onRequest("devicetree/contexts", async () => {
  await allStable();
  return contextAware.map((c) => c.parser.uri);
});

connection.onFoldingRanges(async (event) => {
  await allStable();
  const uri = event.textDocument.uri.replace("file://", "");
  await updateActiveContext(uri);

  const context = await activeContext;

  const isInContext = context?.isInContext(uri);
  if (!context || !isInContext) {
    return [];
  }

  const result = getFoldingRanges(context.parser);
  return result;
});

connection.onTypeDefinition(async (event) => {
  await allStable();
  return typeDefinition(event, contextAware);
});
