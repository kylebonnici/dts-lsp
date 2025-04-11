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
  Settings,
} from "devicetree-language-server-types";

export interface IDeviceTree {
  readonly version: string;

  setLSPSettings(settings: Settings): Promise<void>;
  getContexts(): Promise<ContextListItem[]>;
  setActiveContext(id: string): Promise<void>;
  requestContext(ctx: IntegrationSettings): Promise<ContextListItem>;
  removeContext(id: string): Promise<void>;
}
