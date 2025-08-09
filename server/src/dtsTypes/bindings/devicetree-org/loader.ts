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

import { resolve } from 'path';
import { readFileSync } from 'fs';
import { glob } from 'glob';
import yaml from 'yaml';

import Ajv2019 from 'ajv/dist/2019';
import * as draft7MetaSchema from 'ajv/dist/refs/json-schema-draft-07.json';
import { StringValue } from '../../../ast/dtc/values/string';
import { Node } from '../../../context/node';
import { INodeType } from '../../types';
import { DevicetreeOrgNodeType } from './nodeType';

export class DevicetreeOrgBindingsLoader {
	private schemaIdValidators: Map<string, string> = new Map();
	private ajvMap = new Map<string, Ajv2019>();

	static getNodeCompatible(node: Node) {
		const compatible = node.getProperty('compatible');
		const values = compatible?.ast.values;

		if (values?.values.some((v) => !(v?.value instanceof StringValue)))
			return;

		return values?.values.map((v) => (v?.value as StringValue).value);
	}

	private parseMetaSchema(cwd: string, ajv: Ajv2019) {
		const g = glob.sync('**/*.yaml', { cwd });
		g.forEach((metaSchema) => {
			metaSchema = resolve(cwd, metaSchema);
			try {
				const readData = yaml.parse(readFileSync(metaSchema, 'utf-8'));
				ajv.addMetaSchema(readData);
				this.schemaIdValidators.set(readData['$id'], metaSchema);
			} catch (e) {
				// console.warn(bindingFile, e);
			}
		});
	}

	private parseBindings(cwd: string, ajv: Ajv2019) {
		const g = glob.sync('**/*.yaml', { cwd });
		g.forEach((bindingFile) => {
			bindingFile = resolve(cwd, bindingFile);
			try {
				const readData = yaml.parse(readFileSync(bindingFile, 'utf-8'));
				ajv.addSchema(readData);
				this.schemaIdValidators.set(readData['$id'], bindingFile);
			} catch (e: any) {
				console.warn(bindingFile, e.message);
			}
		});
	}

	getNodeTypes(
		metaSchemas: string[],
		bindings: string[],
		node: Node,
	): INodeType[] {
		const key = `${metaSchemas.join(';')}::${bindings.join(';')}`;
		let ajv = this.ajvMap.get(key);
		if (!ajv) {
			ajv = new Ajv2019({
				strict: false,
				strictSchema: false,
				strictNumbers: false,
			});

			ajv.addMetaSchema(draft7MetaSchema);
			this.ajvMap.set(key, ajv);
			metaSchemas.forEach((folder) => this.parseMetaSchema(folder, ajv!));

			bindings.forEach((folder) => this.parseBindings(folder, ajv!));
		}
		const compatible = DevicetreeOrgBindingsLoader.getNodeCompatible(node);

		const types =
			(compatible
				?.map((c) => {
					try {
						const bestMatchKey = Array.from(
							this.schemaIdValidators.keys(),
						).find((s) => s.endsWith(`/${c}.yaml#`));

						if (!bestMatchKey) {
							return;
						}

						const nodeType = new DevicetreeOrgNodeType(
							ajv,
							bestMatchKey,
						);
						nodeType.bindingsPath =
							this.schemaIdValidators.get(bestMatchKey);
						nodeType.compatible = c;
						const validate = ajv.getSchema(bestMatchKey);
						nodeType.description = (validate?.schema as any)
							.description as string;
						nodeType.examples = (validate?.schema as any)
							.examples as string[];
						nodeType.maintainers = (validate?.schema as any)
							.maintainers as string[];

						return nodeType;
					} catch (e: any) {
						console.warn(e.message);
					}
				})
				.filter((d) => d) as DevicetreeOrgNodeType[]) ?? [];

		return types;
	}

	getBindings() {
		return Array.from(this.schemaIdValidators.keys());
	}
}

let devicetreeOrgBindingsLoader: DevicetreeOrgBindingsLoader | undefined;
export const getDevicetreeOrgBindingsLoader = () => {
	devicetreeOrgBindingsLoader ??= new DevicetreeOrgBindingsLoader();
	return devicetreeOrgBindingsLoader;
};
