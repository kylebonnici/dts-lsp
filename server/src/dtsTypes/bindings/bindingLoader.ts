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

import type { BindingType } from "../../types/index";
import { Node } from "../../context/node";
import { INodeType } from "../types";
import { getDevicetreeOrgBindingsLoader } from "./devicetree-org/loader";
import { getZephyrBindingsLoader } from "./zephyr/loader";

export interface BindingLoader {
  getNodeTypes(node: Node): Promise<INodeType[]>;
}

export interface BindingLoaderFileType {
  zephyrBindings: string[];
  deviceOrgBindingsMetaSchema: string[];
  deviceOrgTreeBindings: string[];
}

export const getBindingLoader = (
  files: BindingLoaderFileType,
  type: BindingType
): BindingLoader => ({
  getNodeTypes: async (node: Node) => {
    switch (type) {
      case "Zephyr":
        return getZephyrBindingsLoader().getNodeTypes(
          files.zephyrBindings,
          node
        );
      case "DevicetreeOrg":
        return getDevicetreeOrgBindingsLoader().getNodeTypes(
          files.deviceOrgBindingsMetaSchema,
          files.deviceOrgTreeBindings,
          node
        );
    }
  },
});
