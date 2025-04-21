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
  WorkspaceFolder,
} from "vscode-languageserver/node";

import { TextDocument } from "vscode-languageserver-textdocument";
import {
  CodeActionDiagnosticData,
  ContextId,
  ContextIssues,
  Issue,
  StandardTypeIssue,
  SyntaxIssue,
  tokenModifiers,
  tokenTypes,
} from "./types";
import {
  fileURLToPath,
  findContext,
  findContexts,
  generateContextId,
  isPathEqual,
  pathToFileURL,
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
import { getBindingLoader } from "./dtsTypes/bindings/bindingLoader";
import { getFoldingRanges } from "./foldingRanges";
import { typeDefinition } from "./typeDefinition";
import { FileWatcher } from "./fileWatcher";
import type {
  Context,
  ContextListItem,
  ContextType,
  IntegrationSettings,
  ResolvedContext,
  SerializedNode,
  Settings,
} from "./types/index";
import {
  defaultSettings,
  resolveContextSetting,
  resolveSettings,
} from "./settings";
import { basename } from "path";
import { getActions } from "./getActions";

const contextAware: ContextAware[] = [];
let activeContext: ContextAware | undefined;
let activeFileUri: string | undefined;
const debounce = new WeakMap<
  ContextAware,
  { abort: AbortController; promise: Promise<void> }
>();
const fileWatchers = new Map<string, FileWatcher>();

const watchContextFiles = async (context: ContextAware) => {
  await context.stable();
  context.getContextFiles().forEach((file) => {
    if (!fileWatchers.has(file)) {
      fileWatchers.set(
        file,
        new FileWatcher(file, onChange, (file) => !!fetchDocument(file))
      );
    }
    fileWatchers.get(file)?.watch();
  });
};

const deleteContext = async (context: ContextAware) => {
  const index = contextAware.indexOf(context);
  if (index === -1) {
    return;
  }

  clearWorkspaceDiagnostics(context);
  debounce.delete(context);
  console.log(
    `(ID: ${context.id}) cleaning Context for [${context.ctxNames.join(",")}]`
  );

  const meta = await contexMeta(context);

  connection.sendNotification("devicetree/contextDeleted", {
    ctxNames: context.ctxNames.map((c) => c.toString()),
    id: context.id,
    ...(await context.getFileTree()),
    settings: context.settings,
    active: activeContext === context,
    type: meta.type,
  } satisfies ContextListItem);
  contextAware.splice(index, 1);

  await reportContexList();

  if (context === activeContext) {
    activeContext = undefined;
    if (contextAware.length) {
      let ctx = activeFileUri
        ? findContext(contextAware, { uri: activeFileUri })
        : undefined;
      ctx ??= contextAware[0];
      console.log("Active context was deleted. Forcing active to", ctx.id);
      await updateActiveContext({ id: ctx.id }, true);
    }
  }

  unwatchContextFiles(context);
};

const unwatchContextFiles = async (context: ContextAware) => {
  await context.stable();
  context
    .getContextFiles()
    .forEach((file) => fileWatchers.get(file)?.unwatch());
};

const isStable = (context: ContextAware) => {
  const d = debounce.get(context);
  if (d?.abort.signal.aborted) return;
  return Promise.all([d?.promise, context.getRuntime()]);
};

const allStable = async () => {
  await Promise.all(contextAware.map(isStable));
};

const isAdHocContext = async (context: ContextAware) =>
  (await getAdhocContexts()).indexOf(context) !== -1;

const getAdhocContexts = async () => {
  const configuredContexts = await getConfiguredContexts();
  return contextAware.filter((c) => !configuredContexts.some((cc) => cc === c));
};

const getConfiguredContexts = async () => {
  const settings = await getResolvedPersistantContextSettings();
  return contextAware.filter((c) =>
    settings.contexts.find((sc) => generateContextId(sc) === c.id)
  );
};

const getUserSettingsContexts = async () => {
  const settings = await getResolvedUserContextSettings();
  return contextAware.filter((c) =>
    settings.contexts.find((sc) => generateContextId(sc) === c.id)
  );
};

const isUserSettingsContext = async (context: ContextAware) =>
  (await getUserSettingsContexts()).indexOf(context) !== -1;

const contextFullyOverlaps = async (a: ContextAware, b: ContextAware) => {
  if (a === b) {
    return true;
  }

  const contextAIncludes = (await a.getAllParsers())
    .flatMap((p) => p.cPreprocessorParser.dtsIncludes)
    .filter((i) => i.resolvedPath);
  const contextBIncludes = (await b.getAllParsers())
    .flatMap((p) => p.cPreprocessorParser.dtsIncludes)
    .filter((i) => i.resolvedPath);

  return contextBIncludes.some((i) =>
    isPathEqual(i.resolvedPath, a.parser.uri)
  ) && contextAIncludes.length
    ? contextAIncludes.every((f) =>
        contextBIncludes.some(
          (ff) =>
            ff.resolvedPath === f.resolvedPath &&
            ff.firstToken.pos.col === f.firstToken.pos.col &&
            ff.firstToken.pos.len === f.firstToken.pos.len &&
            ff.firstToken.pos.line === f.firstToken.pos.line &&
            ff.lastToken.pos.col === f.lastToken.pos.col &&
            ff.lastToken.pos.len === f.lastToken.pos.len &&
            ff.lastToken.pos.line === f.lastToken.pos.line
        )
      )
    : b.getContextFiles().some((ff) => isPathEqual(ff, a.parser.uri));
};

const cleanUpAdHocContext = async (context: ContextAware) => {
  // NOTE For these context Overlays are not an to be consired as there is no way
  // for an adHocContext to be created with overlays
  if (!(await isAdHocContext(context))) return;

  const adhocContexts = await getAdhocContexts();
  const configContexts = await getConfiguredContexts();
  const adhocContextFiles = await resolveContextFiles(adhocContexts);

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

  const contextFiles = context.getContextFiles();
  const contextToClean = adhocContextFiles
    .filter(
      (o) =>
        sameChart.some((r) => r.context === o.context && r.same) ||
        (o.context !== context &&
          isPathEqual(o.context.parser.uri, context.parser.uri) &&
          contextFiles.some((f) => f && o.files.indexOf(f) !== -1))
    )
    .map((o) => o.context);

  if (contextToClean.length) {
    contextToClean.forEach(deleteContext);
  }
};

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRefreshCapability = false;
let hasSemanticTokensRefreshCapability = false;
let hasFoldingRangesRefreshCapability = false;

let workspaceFolder: WorkspaceFolder[] | null | undefined;
connection.onInitialize((params: InitializeParams) => {
  // The workspace folder this server is operating on
  workspaceFolder = params.workspaceFolders;
  connection.console.log(
    `[Server(${process.pid}) ${workspaceFolder?.[0].uri} Version 0.3.1 ] Started and initialize received`
  );

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

  hasSemanticTokensRefreshCapability =
    !!capabilities.workspace?.semanticTokens?.refreshSupport;

  hasFoldingRangesRefreshCapability =
    !!capabilities.workspace?.foldingRange?.refreshSupport;

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
        changeNotifications: true,
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
    connection.workspace.onDidChangeWorkspaceFolders(async (_event) => {
      connection.console.log("Workspace folder change event received");
      await loadSettings();
    });
  }
});

const getResolvedAdhocContextSettings = async () => {
  let unresolvedSettings = getUnresolvedAdhocContextSettings();

  unresolvedSettings = <Settings>{
    ...defaultSettings,
    ...unresolvedSettings,
  };

  return resolveSettings(unresolvedSettings, await getRootWorkspace());
};

const getResolvedPersistantContextSettings = async () => {
  let unresolvedSettings = getUnresolvedPersistantContextSettings();

  unresolvedSettings = <Settings>{
    ...defaultSettings,
    ...unresolvedSettings,
  };

  return resolveSettings(unresolvedSettings, await getRootWorkspace());
};

const getResolvedUserContextSettings = async () => {
  let unresolvedSettings = getUnresolvedUserContextSettings();

  unresolvedSettings = <Settings>{
    ...defaultSettings,
    ...unresolvedSettings,
  };

  return resolveSettings(unresolvedSettings, await getRootWorkspace());
};

const getResolvedAllContextSettings = async () => {
  let unresolvedSettings = getUnresolvedAllContextSettings();

  unresolvedSettings = <Settings>{
    ...defaultSettings,
    ...unresolvedSettings,
  };

  return resolveSettings(unresolvedSettings, await getRootWorkspace());
};

// Cache the settings of all open documents
const documentSettings: Map<string, Thenable<Settings>> = new Map();

const getRootWorkspace = async () => {
  const workspaceFolders = (
    (await connection.workspace.getWorkspaceFolders()) ?? workspaceFolder
  )?.map((p) => fileURLToPath(p.uri));
  return workspaceFolders?.at(0);
};

const createContext = async (context: ResolvedContext) => {
  const existingCtx = findContext(contextAware, {
    id: generateContextId(context),
  });

  if (existingCtx) {
    if (!existingCtx.ctxNames.includes(context.ctxName))
      console.log(
        `(ID: ${existingCtx.id}) Adding name ${
          context.ctxName
        } for [${existingCtx.ctxNames.join(",")}]`
      );
    existingCtx.addCtxName(context.ctxName);
    return existingCtx;
  }

  const id = generateContextId(context);
  console.log(`(ID: ${id}) New context [${context.ctxName}]`);
  console.log(
    `(ID: ${id}) Settings: ${JSON.stringify(context, undefined, "\t")}`
  );

  const newContext = new ContextAware(
    context,
    context.bindingType
      ? getBindingLoader(
          {
            zephyrBindings: context.zephyrBindings ?? [],
            deviceOrgBindingsMetaSchema:
              context.deviceOrgBindingsMetaSchema ?? [],
            deviceOrgTreeBindings: context.deviceOrgTreeBindings ?? [],
          },
          context.bindingType
        )
      : undefined
  );

  contextAware.push(newContext);
  watchContextFiles(newContext);

  await newContext.stable();
  const meta = await contexMeta(newContext);

  connection.sendNotification("devicetree/contextCreated", {
    ctxNames: newContext.ctxNames.map((c) => c.toString()),
    id: newContext.id,
    ...(await newContext.getFileTree()),
    settings: newContext.settings,
    active: newContext === activeContext,
    type: meta.type,
  } satisfies ContextListItem);

  await cleanUpAdHocContext(newContext);
  await reportContexList();
  return newContext;
};

const loadSettings = async () => {
  const resolvedPersistantSettings =
    await getResolvedPersistantContextSettings();
  let resolvedFullSettings = await getResolvedAllContextSettings();
  if (!resolvedFullSettings.allowAdhocContexts) {
    resolvedFullSettings = await getResolvedPersistantContextSettings();
  }

  const allActiveIds = resolvedFullSettings.contexts.map(generateContextId);
  const toDelete = contextAware.filter((c) => !allActiveIds.includes(c.id));
  toDelete.forEach(deleteContext);

  await resolvedPersistantSettings.contexts?.reduce((p, c) => {
    return p.then(async () => {
      await createContext(c);
    });
  }, Promise.resolve());

  if (resolvedFullSettings.allowAdhocContexts) {
    const resolvedAdHocSettings = await getResolvedAdhocContextSettings();
    await resolvedAdHocSettings.contexts?.reduce((p, c) => {
      return p.then(async () => {
        if (findContext(contextAware, { uri: c.dtsFile })) {
          return; // Skip creating this adhoc context thier is a peristance context covering this URI
        }
        await createContext(c);
      });
    }, Promise.resolve());
  }

  if (activeFileUri) {
    await updateActiveContext({ uri: activeFileUri });
  } else if (!activeContext && contextAware.length) {
    console.log(
      `No active context using first context (ID: ${
        contextAware[0].id
      }) [${contextAware[0].ctxNames.join(",")}]`
    );
    await updateActiveContext({ id: contextAware[0].id });
  }
};

let lspConfigurationSettings: Settings | undefined;
let integrationSettings: Settings | undefined;
const adHocContextSettings = new Map<string, Context>();
const integrationContext = new Map<string, Context>();

const getUnresolvedAllContextSettings = (): Settings | undefined => {
  if (!integrationSettings && !lspConfigurationSettings) return;

  const merged = <Settings>{
    ...integrationSettings,
    ...lspConfigurationSettings,
    contexts: [
      ...(lspConfigurationSettings?.contexts ?? []),
      ...Array.from(integrationContext.values()),
      ...Array.from(adHocContextSettings.values()), // last so if ctx exists we can reuse
    ],
  };

  return merged;
};

const getUnresolvedAdhocContextSettings = (): Settings | undefined => {
  if (!integrationSettings && !lspConfigurationSettings) return;

  const merged = <Settings>{
    ...integrationSettings,
    ...lspConfigurationSettings,
    contexts: [...Array.from(adHocContextSettings.values())],
  };

  return merged;
};

const getUnresolvedPersistantContextSettings = (): Settings | undefined => {
  if (!integrationSettings && !lspConfigurationSettings) return;

  const merged = <Settings>{
    ...integrationSettings,
    ...lspConfigurationSettings,
    contexts: [
      ...(lspConfigurationSettings?.contexts ?? []),
      ...Array.from(integrationContext.values()),
    ],
  };

  return merged;
};

const getUnresolvedUserContextSettings = (): Settings | undefined => {
  if (!integrationSettings && !lspConfigurationSettings) return;

  const merged = <Settings>{
    ...lspConfigurationSettings,
    contexts: [...(lspConfigurationSettings?.contexts ?? [])],
  };

  return merged;
};

function deleteTopLevelNulls<T extends Record<string, any>>(
  obj: T
): Partial<T> {
  const result: Partial<T> = { ...obj };

  for (const key in result) {
    if (result[key] === null) {
      delete result[key];
    }
  }

  return result;
}

const onSettingsChanged = async () => {
  const newSettings = await getResolvedAllContextSettings();
  console.log(
    "Resolved settings",
    JSON.stringify(newSettings, undefined, "\t")
  );
  connection.sendNotification("devicetree/settingsChanged", newSettings);

  await loadSettings();
  allStable().then(() => {
    if (hasDiagnosticRefreshCapability) {
      connection.languages.diagnostics.refresh();
    }
  });
};

connection.onDidChangeConfiguration(async (change) => {
  if (!change?.settings?.devicetree) {
    return;
  }

  lspConfigurationSettings = deleteTopLevelNulls(
    change.settings.devicetree
  ) as Settings;

  console.log("Configuration changed", JSON.stringify(change, undefined, "\t"));

  await onSettingsChanged();
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
      return "Expected start address";
    case SyntaxIssue.EXPECTED_END_ADDRESS:
      return "Expected end address";
    case SyntaxIssue.EXPECTED_BITS_SIZE:
    case SyntaxIssue.INVALID_BITS_SIZE:
      return "Expected 8|16|32|64";
    case SyntaxIssue.UNKNOWN_MACRO:
      return "Unknown macro name";
    case SyntaxIssue.EXPECTED_FUNCTION_LIKE:
      return "Expected function like macro";
    case SyntaxIssue.MACRO_EXPECTS_LESS_PARAMS:
      return "Macro expects less arguments";
    case SyntaxIssue.MACRO_EXPECTS_MORE_PARAMS:
      return "Macro expects more arguments";
    case SyntaxIssue.MISSING_ENDIF:
      return "Missing #ENDIF";
    case SyntaxIssue.UNUSED_BLOCK:
      return "Block Unused";
    case SyntaxIssue.BITS_NON_OFFICIAL_SYNTAX:
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
        case ContextIssues.MISSING_NODE:
          return `The following node "${issue.templateStrings[1]}" shall be present in "${issue.templateStrings[0]}" node.`;
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
    case ContextIssues.MISSING_NODE:
      return "Node";
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
        case StandardTypeIssue.PROPERTY_NOT_ALLOWED:
          return `INTRO name is not permitted under this node`;
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
        case StandardTypeIssue.NODE_LOCATION:
          return issue.templateStrings[0];
        case StandardTypeIssue.INVALID_VALUE:
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

const reportNoContextFiles = () => {
  const activeCtxFiles = activeContext?.getContextFiles();
  Array.from(documents.keys()).forEach((u) => {
    if (!activeCtxFiles?.some((p) => isPathEqual(p, fileURLToPath(u)))) {
      connection.sendDiagnostics({
        uri: u,
        version: documents.get(u)?.version,
        diagnostics: [
          {
            severity: DiagnosticSeverity.Warning,
            range: Range.create(Position.create(0, 0), Position.create(0, 0)),
            message: "File not in active context",
            source: "devicetree",
          },
        ],
      });
    }
  });
};

const onChange = async (uri: string) => {
  const contexts = findContexts(contextAware, uri);

  if (!contexts.length) {
    const resolvedSettings = await getResolvedAllContextSettings();
    if (resolvedSettings.allowAdhocContexts === false) {
      return;
    }

    await loadSettings();
    await updateActiveContext({ uri });
  } else {
    contexts.forEach((context) => {
      debounce.get(context)?.abort.abort();
      const abort = new AbortController();
      const promise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          if (abort.signal.aborted) {
            resolve();
            return;
          }
          const t = performance.now();
          const isActive = activeContext === context;
          const itemsToClear = isActive
            ? generateClearWorkspaceDiagnostics(context)
            : [];
          unwatchContextFiles(context);
          await context.reevaluate(uri);
          watchContextFiles(context);
          if (isActive) {
            reportWorkspaceDiagnostics(context).then((d) => {
              const newDiagnostics = d.items.map(
                (i) =>
                  ({
                    uri: i.uri,
                    version: i.version ?? undefined,
                    diagnostics: i.items,
                  } satisfies PublishDiagnosticsParams)
              );
              clearWorkspaceDiagnostics(
                context,
                itemsToClear.filter((i) =>
                  newDiagnostics.every((nd) => nd.uri !== i.uri)
                )
              );
              newDiagnostics.forEach((ii) => {
                connection.sendDiagnostics(ii);
              });
            });
          }

          resolve();
          console.log("reevaluate", performance.now() - t);
        }, 50);
      });

      debounce.set(context, { abort, promise });
    });
  }
};

const fetchDocumentUri = (file: string) => {
  return documents.keys().find((f) => isPathEqual(fileURLToPath(f), file));
};

const fetchDocument = (file: string) => {
  const uri = fetchDocumentUri(file);
  if (!uri) return;

  return documents.get(uri);
};

const generateClearWorkspaceDiagnostics = (context: ContextAware) =>
  context.getContextFiles().map(
    (file) =>
      ({
        uri: pathToFileURL(file),
        version: fetchDocument(file)?.version,
        diagnostics: [],
      } satisfies PublishDiagnosticsParams)
  );

const clearWorkspaceDiagnostics = async (
  context: ContextAware,
  items: PublishDiagnosticsParams[] = generateClearWorkspaceDiagnostics(context)
) => {
  if (context !== activeContext) {
    return;
  }
  await Promise.all(
    items.map((item) => {
      return connection.sendDiagnostics({
        uri: item.uri,
        version: documents.get(item.uri)?.version,
        diagnostics: [],
      } satisfies PublishDiagnosticsParams);
    })
  );
};

const reportWorkspaceDiagnostics = async (context: ContextAware) => {
  await context.stable();
  const t = performance.now();
  const activeContextItems = await Promise.all(
    context.getContextFiles().map(async (file) => {
      const items = await getDiagnostics(context, file);
      return {
        uri: pathToFileURL(file),
        kind: DocumentDiagnosticReportKind.Full,
        items,
        version: fetchDocument(file)?.version ?? null,
      } satisfies WorkspaceDocumentDiagnosticReport;
    })
  );

  console.log(
    `(ID: ${context.id})`,
    "workspace diagnostics",
    `[${context.ctxNames.join(",")}]`,
    performance.now() - t
  );
  return {
    items: [...activeContextItems],
  };
};

async function getDiagnostics(
  context: ContextAware,
  uri: string
): Promise<Diagnostic[]> {
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

    (await context.getAllParsers()).forEach((parser) => {
      parser.issues
        .filter((issue) => isPathEqual(issue.astElement.uri, uri))
        .forEach((issue) => {
          const diagnostic: Diagnostic = {
            severity: issue.severity,
            range: toRange(issue.astElement),
            message: issue.issues
              ? issue.issues.map(syntaxIssueToMessage).join(" or ")
              : "",
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
                type: "SyntaxIssue",
                items: issue.issues,
                edit: issue.edit,
                codeActionTitle: issue.codeActionTitle,
              },
            } satisfies CodeActionDiagnosticData,
          };
          diagnostics.push(diagnostic);
        });
    });

    const contextIssues = (await context.getContextIssues()) ?? [];
    contextIssues
      .filter((issue) => isPathEqual(issue.astElement.uri, uri))
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
                uri: pathToFileURL(element.uri!),
                range: toRange(element),
              },
            })),
          ],
        };
        diagnostics.push(diagnostic);
      });

    const runtime = await context.getRuntime();
    runtime?.typesIssues
      .filter((issue) => isPathEqual(issue.astElement.uri, uri))
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
                uri: pathToFileURL(element.uri!),
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

    return diagnostics;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

const reportContexList = async () => {
  const forLogs = await Promise.all(contextAware.map(contexMeta));

  console.log("======== Context List ========");
  forLogs.forEach((c) => {
    console.log(
      `(ID: ${c.ctx.id}) [${c.ctx.ctxNames.join(",")}]`,
      `[${c.type}]`,
      activeContext === c.ctx ? " [ACTIVE]" : ""
    );
  });
  console.log("==============================");
};

const contexMeta = async (ctx: ContextAware) => {
  const adHoc = await isAdHocContext(ctx);
  const userCtx = !adHoc && (await isUserSettingsContext(ctx));
  return {
    ctx,
    type: (adHoc ? "Ad Hoc" : userCtx ? "User" : "3rd Party") as ContextType,
  };
};

const updateActiveContext = async (id: ContextId, force = false) => {
  if ("uri" in id) {
    activeFileUri = id.uri;
  }

  const resolvedSettings = await getResolvedAllContextSettings();

  await allStable();

  if (activeContext && !force && !resolvedSettings.autoChangeContext) {
    return false;
  }

  if (
    !force &&
    activeContext
      ?.getContextFiles()
      .find((f) => "uri" in id && isPathEqual(f, id.uri))
  )
    return false;

  const oldContext = activeContext;
  const newContext = findContext(contextAware, id);

  if (oldContext !== newContext) {
    if (oldContext) {
      clearWorkspaceDiagnostics(oldContext);
    }
    activeContext = newContext;

    if (newContext) {
      contexMeta(newContext).then(async (meta) => {
        const fileTree = await newContext.getFileTree();
        if (newContext !== activeContext) return;
        connection.sendNotification("devicetree/newActiveContext", {
          ctxNames: newContext.ctxNames.map((c) => c.toString()),
          id: newContext.id,
          ...fileTree,
          settings: newContext.settings,
          active: activeContext === newContext,
          type: meta.type,
        } satisfies ContextListItem);
      });

      reportWorkspaceDiagnostics(newContext).then((d) => {
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

      await reportContexList();
    } else {
      connection.sendNotification("devicetree/newActiveContext", undefined);
    }
  }

  if (hasFoldingRangesRefreshCapability) {
    connection.languages.foldingRange.refresh();
  }
  if (hasSemanticTokensRefreshCapability) {
    connection.languages.semanticTokens.refresh();
  }

  reportNoContextFiles();

  return true;
};

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Only keep settings for open documents
documents.onDidClose(async (e) => {
  const uri = fileURLToPath(e.document.uri);
  const contexts = findContexts(contextAware, uri);
  if (contexts.length === 0) {
    adHocContextSettings.delete(uri);
    connection.sendDiagnostics({
      uri: e.document.uri,
      version: documents.get(e.document.uri)?.version,
      diagnostics: [],
    });
    return;
  }

  await Promise.all(
    contexts.map(async (context) => {
      const contextAllFiles = context?.getContextFiles() ?? [];

      const contextHasFileOpen = contextAllFiles
        .filter((f) => f !== uri)
        .some((f) => fetchDocument(f));
      if (!contextHasFileOpen) {
        if (await isAdHocContext(context)) {
          deleteContext(context);
          adHocContextSettings.delete(context.settings.dtsFile);
        } else {
          clearWorkspaceDiagnostics(context);
        }
      }
    })
  );

  documentSettings.delete(e.document.uri);
});

documents.onDidOpen(async (e) => {
  await allStable();
  reportNoContextFiles();
  const uri = fileURLToPath(e.document.uri);

  const ctx = findContext(contextAware, { uri });
  if (!ctx) {
    const contextBaseSettings: Context = {
      ctxName: basename(uri),
      dtsFile: uri,
    };

    adHocContextSettings.set(uri, contextBaseSettings);
    await onChange(uri);
  } else if (ctx !== activeContext) {
    await updateActiveContext({ id: ctx.id });
  }
});

documents.onDidChangeContent(async (change) => {
  const uri = fileURLToPath(change.document.uri);

  const text = change.document.getText();
  const tokenProvider = getTokenizedDocumentProvider();
  if (!tokenProvider.needsRenew(uri, text)) return;

  console.log("Content changed");
  tokenProvider.renewLexer(uri, text);
  await onChange(uri);
});

// Listen on the connection
connection.listen();

connection.languages.diagnostics.onWorkspace(async () => {
  await allStable();
  const context = activeContext;

  if (!context) {
    return {
      items: [],
    };
  }

  return reportWorkspaceDiagnostics(context);
});

connection.onDidChangeWatchedFiles((_change) => {
  connection.console.log("We received a file change event");
});

connection.onCompletion(
  async (
    textDocumentPosition: TextDocumentPositionParams
  ): Promise<CompletionItem[]> => {
    await allStable();
    const uri = fileURLToPath(textDocumentPosition.textDocument.uri);
    updateActiveContext({ uri });
    const context = quickFindContext(uri);

    if (context) {
      return [
        ...(await getCompletions(textDocumentPosition, context)),
        ...(await getTypeCompletions(textDocumentPosition, context)),
      ];
    }

    return [];
  }
);

connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
  return item;
});

const quickFindContext = (uri: string) => {
  const settings = getUnresolvedAdhocContextSettings();
  return findContext(
    contextAware,
    { uri },
    activeContext,
    settings?.preferredContext
  );
};

connection.onDocumentSymbol(async (h) => {
  await allStable();
  const uri = fileURLToPath(h.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  if (!context) return [];
  return context.getUriParser(uri)?.getDocumentSymbols(uri);
});

connection.onWorkspaceSymbol(async () => {
  await allStable();
  const context = activeContext;
  if (!context) return [];

  return (await context.getAllParsers()).flatMap((p) =>
    p.getWorkspaceSymbols()
  ) satisfies WorkspaceSymbol[];
});

connection.languages.semanticTokens.on(async (h) => {
  try {
    await allStable();
    const uri = fileURLToPath(h.textDocument.uri);
    const context = quickFindContext(uri);

    const tokensBuilder = new SemanticTokensBuilder();

    const isInContext = context?.isInContext(uri);
    if (!context || !isInContext) {
      return { data: [] };
    }

    (await context.getAllParsers()).forEach((parser) =>
      parser.buildSemanticTokens(tokensBuilder, uri)
    );

    return tokensBuilder.build();
  } catch (e) {
    console.log(e);
    throw e;
  }
});

connection.onDocumentLinks(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return context?.getDocumentLinks(uri);
});

connection.onPrepareRename(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return getPrepareRenameRequest(event, context);
});

connection.onRenameRequest(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return getRenameRequest(event, context);
});

connection.onReferences(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return getReferences(event, context);
});

connection.onDefinition(async (event) => {
  await allStable();

  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  const documentLinkDefinition =
    (await context?.getDocumentLinks(uri, event.position))
      ?.filter((docLink) => docLink.target)
      .map((docLink) => Location.create(docLink.target!, docLink.range)) ?? [];

  if (documentLinkDefinition.length) return documentLinkDefinition;

  return getDefinitions(event, context);
});

connection.onDeclaration(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return getDeclaration(event, context);
});

connection.onCodeAction(async (event) => {
  return getCodeActions(event);
});

connection.onDocumentFormatting(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  if (!context) {
    return [];
  }

  return getDocumentFormatting(event, context);
});

connection.onHover(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  const context = quickFindContext(uri);

  return (await getHover(event, context)).at(0);
});

connection.onFoldingRanges(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);

  const context = quickFindContext(uri);

  const isInContext = context?.isInContext(uri);
  if (!context || !isInContext) {
    return [];
  }

  const parser = (await context.getAllParsers()).find((p) =>
    p.getFiles().some((i) => i === uri)
  );

  if (parser) return getFoldingRanges(uri, parser);
  return [];
});

connection.onTypeDefinition(async (event) => {
  await allStable();
  const uri = fileURLToPath(event.textDocument.uri);
  updateActiveContext({ uri });
  const context = quickFindContext(uri);

  return typeDefinition(event, context);
});

connection.onRequest(
  "devicetree/getContexts",
  async (): Promise<ContextListItem[]> => {
    await allStable();
    return Promise.all(
      contextAware.map(async (c) => {
        const meta = await contexMeta(c);
        return {
          ctxNames: c.ctxNames.map((n) => n.toString()),
          id: c.id,
          ...(await c.getFileTree()),
          settings: c.settings,
          active: activeContext === c,
          type: meta.type,
        } satisfies ContextListItem;
      })
    );
  }
);

connection.onRequest(
  "devicetree/setActive",
  async (id: ContextId): Promise<boolean> => {
    await allStable();
    console.log("devicetree/setActive", id);
    const result = await updateActiveContext(id, true);
    return result;
  }
);

connection.onRequest(
  "devicetree/getActiveContext",
  async (id: string): Promise<ContextListItem | undefined> => {
    await allStable();
    console.log("devicetree/getActiveContext", id);
    await updateActiveContext({ id }, true);
    if (!activeContext) return;

    const meta = await contexMeta(activeContext);
    return activeContext
      ? {
          ctxNames: activeContext.ctxNames.map((c) => c.toString()),
          id: id,
          ...(await activeContext.getFileTree()),
          settings: activeContext.settings,
          active: true,
          type: meta.type,
        }
      : undefined;
  }
);

connection.onRequest(
  "devicetree/setDefaultSettings",
  async (setting: IntegrationSettings) => {
    await allStable();
    integrationSettings = setting;
    console.log("Integration Settings", setting);
    await onSettingsChanged();
  }
);

connection.onRequest(
  "devicetree/requestContext",
  async (ctx: Context): Promise<ContextListItem> => {
    await allStable();

    const resolvedSettings = await getResolvedAllContextSettings();
    const resolvedContext = await resolveContextSetting(
      ctx,
      resolvedSettings,
      await getRootWorkspace()
    );
    console.log("devicetree/requestContext", resolvedContext);
    const id = generateContextId(resolvedContext);
    const sameNameCtx = Array.from(integrationContext).find(
      ([, ic]) => ic.ctxName === ctx.ctxName
    );
    if (sameNameCtx) {
      const id = sameNameCtx[0].split(":", 1)[0];
      findContext(contextAware, {
        name: ctx.ctxName.toString(),
      })?.removeCtxName(ctx.ctxName);
      console.log(
        `Removing integration context with ID ${id} and name ${ctx.ctxName}`
      );
      integrationContext.delete(sameNameCtx[0]);
    }
    integrationContext.set(`${id}:${ctx.ctxName}`, ctx);

    await loadSettings();

    const context = contextAware.find((c) => c.id === id);
    if (!context) {
      throw new Error("Failed to create context");
    }

    const meta = await contexMeta(context);
    return {
      ctxNames: context.ctxNames.map((c) => c.toString()),
      id: id,
      ...(await context.getFileTree()),
      settings: context.settings,
      active: true,
      type: meta.type,
    };
  }
);

connection.onRequest(
  "devicetree/removeContext",
  async ({ id, name }: { id: string; name: string }) => {
    await allStable();

    integrationContext.delete(`${id}:${name}`);

    const context = findContext(contextAware, { id });
    if (!context) return;

    context.removeCtxName(name);

    if (context.ctxNames.length) {
      console.log(
        "Context will not be deleted as it is still in use by others"
      );
      return;
    }

    await loadSettings();
  }
);

connection.onRequest(
  "devicetree/compiledDtsOutput",
  async (id: string): Promise<string | undefined> => {
    await allStable();
    if (!id) {
      return;
    }
    const ctx = findContext(contextAware, { id });
    return ctx?.toFullString();
  }
);

connection.onRequest(
  "devicetree/serializedContext",
  async (id: string): Promise<SerializedNode | undefined> => {
    await allStable();
    if (!id) {
      return;
    }
    const ctx = findContext(contextAware, { id });
    return ctx?.serialize();
  }
);

connection.onRequest(
  "devicetree/customActions",
  async (location: TextDocumentPositionParams) => {
    await allStable();
    return getActions(location, activeContext);
  }
);
