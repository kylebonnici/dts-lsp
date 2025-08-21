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

import { Diagnostic, Range } from 'vscode-languageserver-types';

export type BindingType = 'Zephyr' | 'DevicetreeOrg';

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
	compileCommands?: string;
}

export type IntegrationSettings = Omit<
	Settings,
	'contexts' | 'preferredContext'
>;

export type ResolvedContext = PartialBy<
	Required<Context>,
	'cwd' | 'bindingType' | 'compileCommands'
>;

export type ResolvedSettings = PartialBy<
	Required<Settings>,
	'cwd' | 'preferredContext' | 'defaultBindingType'
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

export type ContextType = 'Ad Hoc' | 'User' | '3rd Party';
export interface ContextListItem {
	ctxNames: string[];
	id: string;
	mainDtsPath: File;
	overlays: File[];
	settings: PartialBy<Context, 'ctxName'>;
	active: boolean;
	type: ContextType;
}

export interface File {
	file: string;
	includes: File[];
}

export type PropertyType =
	| 'STRING'
	| 'BYTESTRING'
	| 'ARRAY_VALUE'
	| 'LABEL_REF'
	| 'NODE_PATH'
	| 'NUMBER_VALUE'
	| 'EXPRESSION';

export interface SerializableASTBase {
	readonly uri: string;
	readonly range: Range;
	readonly issues: Diagnostic[];
}

export interface SerializableStringValue extends SerializableASTBase {
	readonly type: 'STRING';
	readonly value: string;
}

export interface SerializableByteString extends SerializableASTBase {
	readonly type: 'BYTESTRING';
	readonly values: ({
		value: string;
		range: Range;
		evaluated: number;
	} | null)[];
}

export interface SerializableArrayValue extends SerializableASTBase {
	readonly type: 'ARRAY_VALUE';
	readonly value: (
		| SerializableLabelRef
		| SerializableNodePath
		| SerializableNumberValue
		| SerializableExpression
		| null
	)[];
}

export interface SerializableLabelRef extends SerializableASTBase {
	readonly type: 'LABEL_REF';
	readonly label: string | null;
	readonly nodePath: string | null;
}

export interface SerializableNodePath extends SerializableASTBase {
	readonly type: 'NODE_PATH';
	readonly nodePath: string | null;
}

export interface SerializableExpressionBase extends SerializableASTBase {
	readonly value: string | null;
	readonly evaluated: number | string;
}

export interface SerializableNumberValue extends SerializableExpressionBase {
	readonly type: 'NUMBER_VALUE';
	readonly evaluated: number;
}

export interface SerializableExpression extends SerializableExpressionBase {
	readonly type: 'EXPRESSION';
}

export type SerializablePropertyValue =
	| SerializableStringValue
	| SerializableByteString
	| SerializableArrayValue
	| SerializableLabelRef
	| SerializableNodePath
	| SerializableExpression
	| SerializableNumberValue
	| null;

export interface SerializablePropertyName extends SerializableASTBase {
	readonly value: string;
}

export type SerializableNexusMapEnty = {
	mappingValuesAst: (
		| SerializableLabelRef
		| SerializableNodePath
		| SerializableNumberValue
		| SerializableExpression
	)[];
	specifierSpace?: string;
	target: string;
	mapItem?: {
		mappingValues: (
			| SerializableLabelRef
			| SerializableNodePath
			| SerializableNumberValue
			| SerializableExpression
		)[];
		target: string;
		parentValues: (
			| SerializableLabelRef
			| SerializableNodePath
			| SerializableNumberValue
			| SerializableExpression
		)[];
	};
};

export interface SerializableProperty extends SerializableASTBase {
	readonly nexusMapEnty: SerializableNexusMapEnty[];
	readonly name: SerializablePropertyName | null;
	readonly values: SerializablePropertyValue[] | null;
}

export type SerializableDtcProperty = Omit<
	SerializableProperty,
	'nexusMapEnty'
>;

export type NodeType = 'ROOT' | 'REF' | 'CHILD';

export interface SerializableNodeAddress extends SerializableASTBase {
	readonly address: number[];
}

export interface SerializableFullNodeName extends SerializableASTBase {
	readonly fullName: string;
	readonly name: SerializableNodeName;
	readonly address: SerializableNodeAddress[] | null;
}

export interface SerializableNodeName extends SerializableASTBase {
	readonly name: string;
}

export enum BindingPropertyType {
	EMPTY = 'EMPTY',
	U32 = 'U32',
	U64 = 'U64',
	STRING = 'STRING',
	PROP_ENCODED_ARRAY = 'PROP_ENCODED_ARRAY',
	STRINGLIST = 'STRINGLIST',
	BYTESTRING = 'BYTESTRING',
	UNKNOWN = 'UNKNOWN',
	ANY = 'ANY',
}

export type TypeConfig = { types: BindingPropertyType[] };

export type SerializedBindingProperty = {
	name: string;
	allowedValues: (number | string)[] | undefined;
	type: TypeConfig[];
	description?: string;
};
interface SerializedBinding {
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
	extends: string[];
	properties?: SerializedBindingProperty[];
}

export interface SerializableNodeBase extends SerializableASTBase {
	readonly type: NodeType;
	readonly properties: SerializableDtcProperty[];
	readonly nodes: SerializableNodeBase[];
}

export interface SerializableNodeRef extends SerializableNodeBase {
	readonly type: 'REF';
	readonly name: SerializableASTBase | null;
}

export interface SerializableRootNode extends SerializableNodeBase {
	readonly type: 'ROOT';
}

export interface SerializableChildNode extends SerializableNodeBase {
	readonly name: SerializableASTBase | null;
	readonly type: 'CHILD';
}

type SerializedMappedReg = {
	mappedStartAddress?: number[];
	startAddress?: number[];
	size?: number[];
	mappedEndAddress?: number[];
	endAddress?: number[];
	inMappingRange?: boolean;
};

export type InterruptControlerSerializedMapping = {
	cells: (SerializableNumberValue | SerializableExpression)[];
	path: string;
	property: SerializableDtcProperty;
};

export type SerializableSpecifierNexusMeta = {
	cells: (SerializableNumberValue | SerializableExpression)[];
	path: string;
	property: SerializableDtcProperty;
};

export type SerializedNode = {
	nodeType?: SerializedBinding;
	issues: Diagnostic[];
	path: string;
	name: string;
	disabled: boolean;
	nodes: SerializableNodeBase[];
	properties: SerializableProperty[];
	childNodes: SerializedNode[];
	reg?: SerializedMappedReg[];
	labels: string[];
	interruptControllerMappings: InterruptControlerSerializedMapping[];
	specifierNexusMappings: SerializableSpecifierNexusMeta[];
};

export type Actions = ClipboardActions;

export type ClipboardActions = {
	type:
		| 'dt_zephyr_macro_prop_node_alias'
		| 'dt_zephyr_macro_prop_node_path'
		| 'dt_zephyr_macro_prop_node_label'
		| 'dt_zephyr_macro_node_path'
		| 'dt_zephyr_macro_node_label'
		| 'path';
	data: string;
};

export type StableResult = {
	ctx: ContextListItem;
	node: SerializedNode;
};

export type LocationResult = {
	nodePath: string;
	propertyName?: string;
};

export type EvaluatedMacro = { macro: string; evaluated: string | number };
