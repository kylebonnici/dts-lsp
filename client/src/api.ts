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
  Actions,
  Context,
  ContextListItem,
  IntegrationSettings,
  ResolvedSettings,
} from "devicetree-language-server-types";
import {
  LanguageClient,
  NotificationType,
  TextDocumentPositionParams,
} from "vscode-languageclient/node";
import { IDeviceTreeAPI as IDeviceTreeAPI } from "./types";
import { EventEmitter } from "events";

const contextDeletedNotification = new NotificationType<ContextListItem>(
  "devicetree/contextDeleted"
);
const contextCreatedNotification = new NotificationType<ContextListItem>(
  "devicetree/contextCreated"
);
const newActiveContextNotification = new NotificationType<
  ContextListItem | undefined
>("devicetree/newActiveContext");
const settingsChangedNotification = new NotificationType<ContextListItem>(
  "devicetree/settingsChanged"
);

export class API implements IDeviceTreeAPI {
  constructor(private readonly client: LanguageClient) {
    this.client.onNotification(contextDeletedNotification, (ctx) =>
      this.event.emit("onContextDeleted", ctx)
    );
    this.client.onNotification(contextCreatedNotification, (ctx) =>
      this.event.emit("onContextCreated", ctx)
    );
    this.client.onNotification(newActiveContextNotification, (ctx) =>
      this.event.emit("onActiveContextChange", ctx)
    );
    this.client.onNotification(settingsChangedNotification, (ctx) =>
      this.event.emit("onSettingsChanged", ctx)
    );
  }
  private event = new EventEmitter();
  version = "0.0.0";

  setDefaultSettings(settings: IntegrationSettings): Promise<void> {
    return this.client.sendRequest("devicetree/setDefaultSettings", settings);
  }

  getContexts(): Promise<ContextListItem[]> {
    return this.client.sendRequest("devicetree/getContexts");
  }

  setActiveContextById(id: string) {
    return this.client.sendRequest("devicetree/setActive", {
      id,
    }) as Promise<boolean>;
  }

  setActiveContextByName(name: string) {
    return this.client.sendRequest("devicetree/setActive", {
      name,
    }) as Promise<boolean>;
  }

  getActiveContext() {
    return this.client.sendRequest("devicetree/getActiveContext") as Promise<
      ContextListItem | undefined
    >;
  }

  requestContext(ctx: Context) {
    return this.client.sendRequest(
      "devicetree/requestContext",
      ctx
    ) as Promise<ContextListItem>;
  }

  removeContext(id: string, name: string) {
    return this.client.sendRequest("devicetree/removeContext", {
      id,
      name,
    }) as Promise<void>;
  }

  compiledOutput(id: string) {
    return this.client.sendRequest(
      "devicetree/compiledDtsOutput",
      id
    ) as Promise<string | undefined>;
  }

  onActiveContextChange(listener: (ctx: ContextListItem | undefined) => void) {
    this.event.addListener("onActiveContextChange", listener);
    return () => {
      this.event.removeListener("onActiveContextChange", listener);
    };
  }

  onContextDeleted(listener: (ctx: ContextListItem) => void): () => void {
    this.event.addListener("onContextDeleted", listener);
    return () => {
      this.event.removeListener("onContextDeleted", listener);
    };
  }

  onContextCreated(listener: (ctx: ContextListItem) => void): () => void {
    this.event.addListener("onContextCreated", listener);
    return () => {
      this.event.removeListener("onContextCreated", listener);
    };
  }

  onSettingsChanged(
    listener: (setiings: ResolvedSettings) => void
  ): () => void {
    this.event.addListener("onSettingsChanged", listener);
    return () => {
      this.event.removeListener("onSettingsChanged", listener);
    };
  }

  getAllowedActions(location: TextDocumentPositionParams) {
    return this.client.sendRequest(
      "devicetree/customActions",
      location
    ) as Promise<Actions[]>;
  }
}
