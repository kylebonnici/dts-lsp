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
  Context,
  ContextListItem,
  IntegrationSettings,
  LocationResult,
  ResolvedSettings,
  SerializedNode,
  StableResult,
} from "devicetree-language-server-types";
import {
  Disposable,
  TextDocumentPositionParams,
} from "vscode-languageclient/node";

export interface IDeviceTreeAPI {
  readonly version: string;

  setDefaultSettings(settings: IntegrationSettings): Promise<void>;
  getContexts(): Promise<ContextListItem[]>;
  setActiveContextById(id: string): Promise<boolean>;
  setActiveContextByName(name: string): Promise<boolean>;
  getActivePath(
    textDocumentPositionParams: TextDocumentPositionParams
  ): Promise<LocationResult>;
  getActiveContext(): Promise<ContextListItem | undefined>;
  copyZephyrCMacroIdentifier(textDocumentPositionParams: TextDocumentPositionParams): Promise<void>;
  requestContext(ctx: Context): Promise<ContextListItem>;
  removeContext(id: string, name: string): Promise<void>;
  compiledOutput(id?: string): Promise<string | undefined>;
  serializedContext(id: string): Promise<SerializedNode | undefined>;

  onActiveContextChange(
    listener: (ctx: ContextListItem | undefined) => void
  ): Disposable;
  onActiveContextStable(listener: (result: StableResult) => void): Disposable;
  onActivePath(listener: (result: LocationResult) => void): Disposable;
  onContextStable(listener: (result: StableResult) => void): Disposable;
  onContextDeleted(listener: (ctx: ContextListItem) => void): Disposable;
  onContextCreated(listener: (ctx: ContextListItem) => void): Disposable;
  onSettingsChanged(listener: (setiings: ResolvedSettings) => void): Disposable;
}
