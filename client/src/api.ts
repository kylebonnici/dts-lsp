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

import type {
  ContextListItem,
  Settings,
} from "devicetree-language-server-types";
import { LanguageClient } from "vscode-languageclient/node";
import { IDeviceTree as IDeviceTreeAPI } from "./types";

export class API implements IDeviceTreeAPI {
  constructor(private readonly client: LanguageClient) {}
  version = "0.0.0";

  setLSPSettings(settings: Settings): Promise<void> {
    return this.client.sendRequest("devicetree/setLSPSettings", settings);
  }

  getContexts(): Promise<ContextListItem[]> {
    return this.client.sendRequest("devicetree/getContexts");
  }

  setActiveContext(id: string) {
    return this.client.sendRequest("devicetree/setActive", id) as Promise<void>;
  }

  removeContext(id: string) {
    return this.client.sendRequest(
      "devicetree/removeContext",
      id
    ) as Promise<void>;
  }
}
