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

import { DocumentLink } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { BindingType } from '../../types/index';
import { Node } from '../../context/node';
import { INodeType } from '../types';
import { FileDiagnostic } from '../../types';
import { getDevicetreeOrgBindingsLoader } from './devicetree-org/loader';
import { getZephyrBindingsLoader } from './zephyr/loader';

export interface BindingLoader {
	getNodeTypes(node: Node): { type: INodeType[]; issues: FileDiagnostic[] };
	readonly type: BindingType;
	readonly files: BindingLoaderFileType;
	getBindings(): string[];
	getBusTypes(): string[];
	getDocumentLinks?(document?: TextDocument): DocumentLink[];
	dispose(): void;
}

export interface BindingLoaderFileType {
	zephyrBindings: string[];
	deviceOrgBindingsMetaSchema: string[];
	deviceOrgTreeBindings: string[];
}

let keyUsedCount = new Map<string, number>();
export const getBindingLoader = (
	files: BindingLoaderFileType,
	type: BindingType,
): BindingLoader => {
	const zephyrKey = files.zephyrBindings.join(':');
	if (type === 'Zephyr') {
		keyUsedCount.set(zephyrKey, (keyUsedCount.get(zephyrKey) ?? 0) + 1);
		getZephyrBindingsLoader().loadTypeAndCache(
			files.zephyrBindings,
			zephyrKey,
		);
	}
	return {
		files,
		type,
		getNodeTypes: (node: Node) => {
			switch (type) {
				case 'Zephyr':
					return getZephyrBindingsLoader().getNodeTypes(
						node,
						zephyrKey,
					);

				case 'DevicetreeOrg':
					return {
						type: getDevicetreeOrgBindingsLoader().getNodeTypes(
							files.deviceOrgBindingsMetaSchema,
							files.deviceOrgTreeBindings,
							node,
						),
						issues: [], // TODO
					};
			}
		},
		getBindings: () => {
			switch (type) {
				case 'Zephyr':
					return getZephyrBindingsLoader().getBindings(zephyrKey);

				case 'DevicetreeOrg':
					return getDevicetreeOrgBindingsLoader().getBindings();
			}
		},
		getBusTypes: () => {
			switch (type) {
				case 'Zephyr':
					return getZephyrBindingsLoader().getBusTypes();

				case 'DevicetreeOrg':
					return [];
			}
		},
		getDocumentLinks(document) {
			if (!document) {
				return [];
			}

			switch (type) {
				case 'Zephyr':
					return getZephyrBindingsLoader().getDocumentLinks(
						document,
						files.zephyrBindings,
					);

				case 'DevicetreeOrg':
					return [];
			}
		},
		dispose: () => {
			if (type === 'Zephyr') {
				const count = keyUsedCount.get(zephyrKey) ?? 0;
				if (count <= 1) {
					keyUsedCount.delete(zephyrKey);
					getZephyrBindingsLoader().resetCache(zephyrKey);
				} else {
					keyUsedCount.set(zephyrKey, count - 1);
				}
			}
		},
	};
};
