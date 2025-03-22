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

import { type Node } from "../context/node";
import { getRootNodeType } from "./standardTypes/nodeTypes/root/node";
import { getStandardDefaultType } from "./standardDefaultType";
import { getAliasesNodeType } from "./standardTypes/nodeTypes/aliases/node";
import { getMemoryNodeType } from "./standardTypes/nodeTypes/memory/node";
import { getReservedMemoryNodeType } from "./standardTypes/nodeTypes/reserved-memory/node";
import { getChosenNodeType } from "./standardTypes/nodeTypes/chosen/node";
import { getCpusNodeType } from "./standardTypes/nodeTypes/cpus/node";
import { getCpuNodeType } from "./standardTypes/nodeTypes/cpus/cpu/node";

export function getStandardType(node?: Node) {
  switch (node?.name) {
    case "/":
      return getRootNodeType();
    case "aliases":
      return getAliasesNodeType();
    case "memory":
      return getMemoryNodeType();
    case "reserved-memory":
      return getReservedMemoryNodeType();
    case "chosen":
      return getChosenNodeType();
    case "cpus":
      return getCpusNodeType();
    case "cpu":
      return getCpuNodeType();
  }

  return getStandardDefaultType();
}
