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

import * as path from "path";
import { workspace, ExtensionContext } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

class API {
  public get client(): LanguageClient {
    return client;
  }
  getContexts() {
    return client.sendRequest("devicetree/getContexts");
  }
}

export async function activate(context: ExtensionContext) {
  // The server is implemented in node
  const serverModule = context.asAbsolutePath(path.join("dist", "server.js"));

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
    },
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Register the server for plain text documents
    documentSelector: [{ scheme: "file", language: "devicetree" }],
    synchronize: {
      configurationSection: "devicetree",
      fileEvents: [
        workspace.createFileSystemWatcher("**/*.dts"),
        workspace.createFileSystemWatcher("**/*.dtsi"),
        workspace.createFileSystemWatcher("**/*.overlay"),
      ],
    },
  };

  // Create the language client and start the client.
  client = new LanguageClient(
    "devicetree",
    "devicetree",
    serverOptions,
    clientOptions
  );

  // Start the client. This will also launch the server
  await client.start();

  return new API();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
