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

import { Diagnostic, Range } from "vscode-languageserver-types";

export type BindingType = "Zephyr" | "DevicetreeOrg";

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export interface Context {
  ctxName: string | number;
  cwd?: string;
  includePaths?: string[];
  dtsFile: string;
  overlays?: string[];
  bindingType?: BindingType;
  zephyrBindings?: string[];
  deviceOrgTreeBindings?: string[];
  deviceOrgBindingsMetaSchema?: string[];
  lockRenameEdits?: string[];
}

export type IntegrationSettings = Omit<
  Settings,
  "contexts" | "preferredContext"
>;

export type ResolvedContext = PartialBy<
  Required<Context>,
  "cwd" | "bindingType"
>;

export type ResolvedSettings = PartialBy<
  Required<Settings>,
  "cwd" | "preferredContext" | "defaultBindingType"
>;

export interface Settings {
  cwd?: string;
  defaultBindingType?: BindingType;
  defaultZephyrBindings?: string[];
  defaultDeviceOrgTreeBindings?: string[];
  defaultDeviceOrgBindingsMetaSchema?: string[];
  defaultIncludePaths?: string[];
  contexts?: ResolvedContext[];
  preferredContext?: string | number;
  defaultLockRenameEdits?: string[];
  autoChangeContext?: boolean;
  allowAdhocContexts?: boolean;
}

export type ContextType = "Ad Hoc" | "User" | "3rd Party";
export interface ContextListItem {
  ctxNames: string[];
  id: string;
  mainDtsPath: File;
  overlays: File[];
  settings: PartialBy<Context, "ctxName">;
  active: boolean;
  type: ContextType;
}

export interface File {
  file: string;
  includes: File[];
}

export type PropertyType =
  | "STRING"
  | "BYTESTRING"
  | "ARRAY_VALUE"
  | "LABEL_REF"
  | "NODE_PATH"
  | "NUMBER_VALUE"
  | "EXPRESSION";

export class SerializableASTBase {
  constructor(
    public readonly uri: string,
    public readonly range: Range,
    public readonly issues: Diagnostic[]
  ) {}
}

export class SerializableStringValue extends SerializableASTBase {
  readonly type: PropertyType = "STRING";

  constructor(
    public readonly value: string,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableByteString extends SerializableASTBase {
  readonly type: PropertyType = "BYTESTRING";

  constructor(
    public readonly values: ({
      value: string;
      range: Range;
      evaluated: number;
    } | null)[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableArrayValue extends SerializableASTBase {
  readonly type: PropertyType = "ARRAY_VALUE";

  constructor(
    public readonly value: (
      | SerializableLabelRef
      | SerializableNodePath
      | SerializableExpressionBase
      | null
    )[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableLabelRef extends SerializableASTBase {
  readonly type: PropertyType = "LABEL_REF";

  constructor(
    readonly label: string | null,
    readonly nodePath: string | null,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableNodePath extends SerializableASTBase {
  readonly type: PropertyType = "NODE_PATH";

  constructor(
    readonly nodePath: string | null,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export abstract class SerializableExpressionBase extends SerializableASTBase {
  constructor(
    readonly value: string | null,
    readonly evaluated: number | string,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableNumberValue extends SerializableExpressionBase {
  readonly type: PropertyType = "NUMBER_VALUE";

  constructor(
    value: string,
    evaluated: number,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(value, evaluated, uri, range, issues);
  }
}

export class SerializableExpression extends SerializableExpressionBase {
  readonly type: PropertyType = "EXPRESSION";

  constructor(
    value: string,
    evaluated: number | string,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(value, evaluated, uri, range, issues);
  }
}

export type SerializablePropertyValue =
  | SerializableStringValue
  | SerializableByteString
  | SerializableArrayValue
  | SerializableLabelRef
  | SerializableNodePath
  | SerializableExpressionBase
  | null;

export class SerializablePropertyName extends SerializableASTBase {
  constructor(
    public readonly value: string,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}
export class SerializableDtcProperty extends SerializableASTBase {
  constructor(
    public readonly name: SerializablePropertyName | null,
    public readonly values: SerializablePropertyValue[] | null,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export type NodeType = "ROOT" | "REF" | "CHILD";

export class SerializableNodeAddress extends SerializableASTBase {
  constructor(
    readonly address: number[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableFullNodeName extends SerializableASTBase {
  constructor(
    readonly fullName: string,
    readonly name: SerializableNodeName,
    readonly address: SerializableNodeAddress[] | null,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableNodeName extends SerializableASTBase {
  constructor(
    readonly name: string,
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export enum BindingPropertyType {
  EMPTY = "EMPTY",
  U32 = "U32",
  U64 = "U64",
  STRING = "STRING",
  PROP_ENCODED_ARRAY = "PROP_ENCODED_ARRAY",
  STRINGLIST = "STRINGLIST",
  BYTESTRING = "BYTESTRING",
  UNKNOWN = "UNKNOWN",
  ANY = "ANY",
}

export type TypeConfig = { types: BindingPropertyType[] };

export abstract class SerializedBinding {
  onBus?: string;
  bus?: string[];
  description?: string;
  maintainers?: string[];
  examples?: string[];
  cellsValues?: {
    specifier: string;
    values: string[];
  }[];
  bindingsPath?: string;
  compatible?: string;
  properties?: {
    name: string;
    allowedValues: (number | string)[] | undefined;
    type: TypeConfig[];
  }[];
}

export abstract class SerializableNodeBase extends SerializableASTBase {
  constructor(
    readonly type: NodeType,
    public readonly name: SerializableASTBase | null,
    readonly properties: SerializableDtcProperty[],
    readonly nodes: SerializableNodeBase[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super(uri, range, issues);
  }
}

export class SerializableNodeRef extends SerializableNodeBase {
  constructor(
    name: SerializableLabelRef | null,
    properties: SerializableDtcProperty[],
    nodes: SerializableNodeBase[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super("REF", name, properties, nodes, uri, range, issues);
  }
}

export class SerializableRootNode extends SerializableNodeBase {
  constructor(
    properties: SerializableDtcProperty[],
    nodes: SerializableNodeBase[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super("ROOT", null, properties, nodes, uri, range, issues);
  }
}

export class SerializableChildNode extends SerializableNodeBase {
  constructor(
    name: SerializableFullNodeName | null,
    properties: SerializableDtcProperty[],
    nodes: SerializableNodeBase[],
    uri: string,
    range: Range,
    issues: Diagnostic[]
  ) {
    super("CHILD", name, properties, nodes, uri, range, issues);
  }
}

type SerializedMappedReg = {
  mappedStartAddress?: number[];
  startAddress?: number[];
  size?: number[];
  mappedEndAddress?: number[];
  endAddress?: number[];
  inRange?: boolean;
  inMappingRange?: boolean;
};

export type SerializedNode = {
  nodeType?: SerializedBinding;
  issues: Diagnostic[];
  path: string;
  name: string;
  nodes: SerializableNodeBase[];
  properties: SerializableDtcProperty[];
  childNodes: SerializedNode[];
  reg?: SerializedMappedReg[];
};

export type Actions = ClipboardActions;

export type ClipboardActions = {
  type:
    | "dt_zephyr_macro_prop_node_alias"
    | "dt_zephyr_macro_prop_node_path"
    | "dt_zephyr_macro_prop_node_label"
    | "dt_zephyr_macro_node_path"
    | "dt_zephyr_macro_node_label"
    | "path";
  data: string;
};
