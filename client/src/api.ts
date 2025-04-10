/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { ContextListItem } from 'devicetree-language-server';
import { LanguageClient } from "vscode-languageclient/node";

export class API {
  #client: LanguageClient;

  constructor(client: LanguageClient) {
    this.#client = client;
  }
  public get client(): LanguageClient {
    return this.#client;
  }

  getContexts(): Promise<ContextListItem[]> {
    return this.#client.sendRequest("devicetree/getContexts") as Promise<
      ContextListItem[]
    >;
  }
}
