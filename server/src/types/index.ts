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

export type SerializedAnyInternalValue =
	| SerializableLabelRef
	| SerializableNodePath
	| SerializableNumberValue
	| SerializableExpression;

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
	showFormattingErrorAsDiagnostics?: boolean;
	compileCommands?: string;
	disableFileWatchers?: boolean;
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
	defaultShowFormattingErrorAsDiagnostics?: boolean;
	autoChangeContext?: boolean;
	allowAdhocContexts?: boolean;
	disableFileWatchers?: boolean;
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
	readonly values: (
		| SerializableNumberValue
		| SerializableExpression
		| null
	)[];
}

export interface SerializableArrayValue extends SerializableASTBase {
	readonly type: 'ARRAY_VALUE';
	readonly value: (SerializedAnyInternalValue | null)[];
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
	readonly value: string;
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

export type SerializableNexusMapEntry = {
	mappingValuesAst: SerializedAnyInternalValue[];
	specifierSpace?: string;
	target: string;
	cellCount: number;
	mapItem?: SerializedNexusMap;
};

export interface SerializableProperty extends SerializableASTBase {
	readonly replaces: Omit<SerializableASTBase, 'issues'>[];
	readonly nexusMapEntry: SerializableNexusMapEntry[];
	readonly name: SerializablePropertyName;
	readonly values?: SerializablePropertyValue[] | null;
	readonly nodePath: string;
}

export type SerializableDtcProperty = Omit<
	SerializableProperty,
	'nexusMapEntry' | 'nodePath' | 'replaces'
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

export type BindingPropertyType =
	| 'EMPTY'
	| 'U32'
	| 'U64'
	| 'STRING'
	| 'PROP_ENCODED_ARRAY'
	| 'STRINGLIST'
	| 'BYTESTRING'
	| 'UNKNOWN'
	| 'ANY';

export type TypeConfig = { types: BindingPropertyType[] };

export type SerializedBindingProperty = {
	name: string;
	nameIsRegex: boolean;
	allowedValues: (number | string)[] | undefined;
	type: TypeConfig[];
	description?: string;
	required: boolean;
};
export interface SerializedBinding {
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
	zephyrBinding?: ZephyrBindingYml;
}

export type SerializableNodeBase =
	| SerializableNodeRef
	| SerializableRootNode
	| SerializableChildNode;

export interface SerializableNodeRef extends SerializableASTBase {
	readonly type: 'REF';
	readonly name: SerializableLabelRef | SerializableNodePath | null;
	readonly properties: SerializableDtcProperty[];
	readonly nodes: SerializableNodeBase[];
}

export interface SerializableRootNode extends SerializableASTBase {
	readonly type: 'ROOT';
	readonly properties: SerializableDtcProperty[];
	readonly nodes: SerializableNodeBase[];
}

export interface SerializableChildNode extends SerializableASTBase {
	readonly name: SerializableFullNodeName | null;
	readonly type: 'CHILD';
	readonly properties: SerializableDtcProperty[];
	readonly nodes: SerializableNodeBase[];
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
	specifierSpace?: string;
};

export type SerializableSpecifierNexusMeta = {
	cells: (SerializableNumberValue | SerializableExpression)[];
	path: string;
	property: SerializableDtcProperty;
	propertyNodePath: string;
	specifierSpace: string;
};

export type SerializedNode = {
	nodeType?: SerializedBinding;
	issues: Diagnostic[];
	path: string;
	name: string;
	fullName: string;
	disabled: boolean;
	nodes: SerializableNodeBase[];
	properties: SerializableProperty[];
	childNodes: SerializedNode[];
	reg?: SerializedMappedReg[];
	labels: string[];
	interruptControllerMappings: InterruptControlerSerializedMapping[];
	specifierNexusMappings: SerializableSpecifierNexusMeta[];
	nexusMaps: SerializedNexusMap[];
};

export interface SerializedNexusMap {
	childCellCount: number;
	mappingValues: SerializedAnyInternalValue[];
	target?: string;
	targetAst?: SerializedAnyInternalValue;
	parentCellCount?: number;
	parentValues?: SerializedAnyInternalValue[];
	specifierSpace: string;
}

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

export type LocationResult = {
	nodePath: string;
	propertyName?: string;
};

export type EvaluatedMacro = { macro: string; evaluated: string | number };

export type MemoryView = {
	name: string;
	labels: string[];
	nodePath: string;
	start: number[];
	size: number[];
};

export type GroupedMemoryView = {
	name: string;
	partitions: Omit<MemoryView, 'name'>[];
};

export interface TreeNode {
	name: string;
	start: number[];
	size: number[];
	children: TreeNode[];
}

export interface DomainTree {
	name: string;
	children: TreeNode[];
};

interface BlockAllowList {
	'property-blocklist'?: string[];
	'property-allowlist'?: string[];
}

export interface ChildNodeInclude extends BlockAllowList {
	'child-binding'?: ChildNodeInclude;
}

interface Include extends BlockAllowList {
	name: string;
	'child-binding'?: ChildNodeInclude;
}

export type ZephyrPropertyType =
	| 'string'
	| 'int'
	| 'boolean'
	| 'array'
	| 'uint8-array'
	| 'string-array'
	| 'phandle'
	| 'phandles'
	| 'phandle-array'
	| 'path'
	| 'compound';

export type CellSpecifier = `${string}-cells`;

export type ZephyrBindingsProperty = {
	name: string;
	required?: boolean;
	type?: ZephyrPropertyType;
	deprecated?: false;
	default?: string | number | (string | number)[];
	description?: string;
	enum?: (string | number)[];
	const?: string | number | (string | number)[];
	'specifier-space'?: string;
};
export interface ZephyrBindingYml {
	filePath: string;
	include: Include[];
	rawInclude: {
		name: string;
		'property-blocklist'?: string[];
		'property-allowlist'?: string[];
	}[];
	description?: string;
	compatible?: string;
	'child-binding'?: ZephyrBindingYml;
	bus?: string[];
	'on-bus'?: string;
	properties?: {
		[key: string]: ZephyrBindingsProperty;
	};
	[key: CellSpecifier]: string[];
	extends?: string[]; // our entry to collaps include
	isChildBinding: boolean;
}
