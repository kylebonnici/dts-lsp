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

import { resolve, basename } from 'path';
import { readFileSync } from 'fs';
import p from 'path';
import yaml from 'yaml';
import { glob } from 'glob';
import {
	DiagnosticSeverity,
	DiagnosticTag,
	DocumentLink,
	ParameterInformation,
	Range,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getStandardType } from '../../../dtsTypes/standardTypes';
import { NodeType, PropertyNodeType } from '../../../dtsTypes/types';
import { Node } from '../../../context/node';
import { StringValue } from '../../../ast/dtc/values/string';
import {
	flatNumberValues,
	generateOrTypeObj,
	getU32ValueFromProperty,
	resolvePhandleNode,
} from '../../../dtsTypes/standardTypes/helpers';
import {
	FileDiagnostic,
	MacroRegistryItem,
	StandardTypeIssue,
} from '../../../types';
import {
	createTokenIndex,
	fileURLToPath,
	genStandardTypeDiagnostic,
	pathToFileURL,
} from '../../../helpers';
import { NexuxMapping, Property } from '../../../context/property';
import { BindingPropertyType } from '../../../types/index';
import { ASTBase } from '../../../ast/base';
import { getSimpleBusType } from '../../../dtsTypes/standardTypes/nodeTypes/simpleBus/node';
import { Expression } from '../../../ast/cPreprocessors/expression';

type ZephyrPropertyType =
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

type ZephyrBindingsProperty = {
	required: boolean;
	type: ZephyrPropertyType;
	deprecated?: false;
	default?: string | number | (string | number)[];
	description?: string;
	enum?: (string | number)[];
	const?: string | number | (string | number)[];
	'specifier-space'?: string;
};
interface ZephyrBindingYml {
	filePath: string;
	include: {
		name: string;
		'property-blocklist'?: string[];
		'property-allowlist'?: string[];
	}[];
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
}

type CellSpecifier = `${string}-cells`;

const ZephyrTypeToDTSType = (type: ZephyrPropertyType) => {
	switch (type) {
		case 'string':
			return generateOrTypeObj(BindingPropertyType.STRING);
		case 'int':
			return generateOrTypeObj(BindingPropertyType.U32);
		case 'boolean':
			return generateOrTypeObj(BindingPropertyType.EMPTY);
		case 'array':
			return generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY);
		case 'uint8-array':
			return generateOrTypeObj(BindingPropertyType.BYTESTRING);
		case 'string-array':
			return generateOrTypeObj(BindingPropertyType.STRINGLIST);
		case 'phandle':
			return generateOrTypeObj(BindingPropertyType.U32);
		case 'phandles':
			return generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY);
		case 'phandle-array':
			return generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY);
		case 'path':
			return generateOrTypeObj([
				BindingPropertyType.STRING,
				BindingPropertyType.U32,
			]);
		case 'compound':
			return generateOrTypeObj(BindingPropertyType.ANY);
	}
};

const ZephyrDefaultTypeDefault = (type: ZephyrPropertyType, def: any) => {
	switch (type) {
		case 'string':
			return typeof def === 'string' ? def : undefined;
		case 'int':
			return typeof def === 'number' ? def : undefined;
		case 'boolean':
			return undefined;
		case 'array':
			return Array.isArray(def) && def.every((v) => typeof v === 'number')
				? def
				: undefined;
		case 'uint8-array':
			return Array.isArray(def) && def.every((v) => typeof v === 'number')
				? def
				: undefined;
		case 'string-array':
			return Array.isArray(def) && def.every((v) => typeof v === 'string')
				? def
				: undefined;
		case 'phandle':
			return undefined;
		case 'phandles':
			return undefined;
		case 'phandle-array':
			return undefined;
		case 'path':
			return undefined;
		case 'compound':
			return undefined;
	}
};

const resolveBinding = (
	bindings: ZephyrBindingYml[],
	binding: ZephyrBindingYml,
): ZephyrBindingYml | undefined => {
	binding.extends ??= [];
	binding = binding.include.reduce((p, c) => {
		const toMergeIn = bindings.find((b) => basename(b.filePath) === c.name);
		if (toMergeIn) {
			const propertiesToExclude = c['property-blocklist'];
			const propertiesToInclude = c['property-allowlist'];
			binding.extends?.push(
				...p.include.map((i) => basename(i.name, '.yaml')),
			);
			p.include = p.include.filter((i) => i !== c);
			return (
				mergeAintoB(
					bindings,
					toMergeIn,
					p,
					propertiesToExclude,
					propertiesToInclude,
				) ?? p
			);
		}
		console.warn(`Unable to find ${c.name}`);
		return p;
	}, binding);

	if (binding['child-binding']) {
		binding['child-binding'].include = simplifiyInclude(
			binding['child-binding'].include,
		);
		binding['child-binding'] = resolveBinding(
			bindings,
			binding['child-binding'],
		);
	}

	if (!binding.include.length) {
		return binding;
	}
};

const mergeAintoB = (
	bindings: ZephyrBindingYml[],
	a: ZephyrBindingYml,
	b: ZephyrBindingYml,
	propertiesToExclude: string[] = [],
	propertiesToInclude?: string[],
): ZephyrBindingYml | undefined => {
	const resolvedA = resolveBinding(bindings, a);
	const resolvedB = resolveBinding(bindings, b);

	if (!resolvedA || !resolvedB) {
		return;
	}

	// merge properties
	const allPropertiesNames = new Set<string>();
	Object.keys(resolvedA?.properties ?? {}).forEach((name) =>
		allPropertiesNames.add(name),
	);
	Object.keys(resolvedB?.properties ?? {}).forEach((name) =>
		allPropertiesNames.add(name),
	);

	let newProperties = {};
	Array.from(allPropertiesNames).forEach((name) => {
		const propertyFromA =
			propertiesToExclude?.some((n) => n === name) ||
			(propertiesToInclude &&
				!propertiesToInclude.some((n) => n === name)) // as per zephyr we cannot have both propertiesToExclude and propertiesToInclude
				? {}
				: (resolvedA.properties?.[name] ?? {});
		const propertyFromB = resolvedB.properties?.[name] ?? {};

		newProperties = {
			...newProperties,
			[name]: {
				...propertyFromA,
				...propertyFromB,
			},
		};
	});

	resolvedB.properties = newProperties;
	resolvedB.extends ??= [];
	resolvedB.extends.push(...(resolvedA.extends ?? []));

	// merge cell specifiers
	const allSpecifierNames = new Set<string>();
	const cellsAKeys = Object.keys(resolvedA).filter((key) =>
		key.endsWith('-cells'),
	);
	cellsAKeys.forEach((name) => allSpecifierNames.add(name));
	const cellsBKeys = Object.keys(resolvedA).filter((key) =>
		key.endsWith('-cells'),
	);
	cellsBKeys.forEach((name) => allSpecifierNames.add(name));

	Array.from(allSpecifierNames).forEach((name) => {
		const fromA = resolvedA[name as CellSpecifier] ?? [];
		const fromB = resolvedB[name as CellSpecifier] ?? [];

		resolvedB[name as CellSpecifier] = Array.from([...fromA, ...fromB]);
	});

	resolvedB['on-bus'] ??= resolvedA['on-bus'];

	if (!resolvedB.bus) {
		resolvedB.bus = resolvedA.bus;
	} else {
		resolvedB.bus.push(...(resolvedA.bus ?? []));
	}

	return resolvedB;
};

const simplifiyInclude = (
	include:
		| string
		| (
				| string
				| {
						name: string;
						'property-blocklist'?: string[];
						'property-allowlist'?: string[];
				  }
		  )[]
		| undefined,
): {
	name: string;
	'property-blocklist'?: string[];
	'property-allowlist'?: string[];
}[] => {
	if (!include) {
		return [];
	}
	if (typeof include === 'string') {
		return [{ name: include }];
	}

	return include.map((i) => (typeof i !== 'string' ? i : { name: i }));
};

export class ZephyrBindingsLoader {
	private typeCache: Map<string, Map<string, (node: Node) => NodeType>> =
		new Map();
	private processedFolders = new Set<string>();
	private zephyrBindingCache: Map<string, ZephyrBindingYml> = new Map();

	static getCompatibleKeys(compatable: string, parent?: Node | null) {
		if (!parent || !parent.nodeType?.bus?.length) {
			return [compatable];
		}

		return [
			...parent.nodeType.bus.map((bus) => `${compatable}::${bus}`),
			compatable,
		];
	}

	static getNodeCompatible(node: Node) {
		const compatible = node.getProperty('compatible');
		const values = compatible?.ast.values;

		const bindings = values?.values.filter(
			(v) => v && v.value instanceof StringValue,
		);

		if (!bindings?.length) return;

		return bindings.map((v) =>
			v?.value
				? {
						name: (v.value as StringValue).value,
						ast: v.value,
					}
				: undefined,
		);
	}

	getNodeTypes(
		node: Node,
		key: string,
	): { type: NodeType[]; issues: FileDiagnostic[] } {
		const compatible = ZephyrBindingsLoader.getNodeCompatible(node)?.filter(
			(v) => v,
		) as
			| {
					name: string;
					ast: ASTBase;
			  }[]
			| undefined;

		if (!compatible?.length) {
			if (node.name === 'zephyr,user') {
				const folders = key.split(':');
				const bindings = Array.from(this.zephyrBindingCache.keys())
					.filter((p) => folders.some((f) => p.startsWith(f)))
					.flatMap((path) => this.zephyrBindingCache.get(path)!);

				const base = bindings.find((b) =>
					b.filePath.endsWith(`/base.yaml`),
				);
				const baseType = base
					? convertBindingToType(base, node)
					: undefined;
				if (baseType) {
					baseType.warnMismatchProperties = false;
					const compat = baseType.properties.find(
						(p) => p.name === 'compatible',
					);
					if (compat) {
						compat.required = () => 'optional';
					}
				}

				return {
					type: [baseType ?? getStandardType(node)],
					issues: [],
				};
			}

			return { type: [getStandardType(node)], issues: [] };
		}

		const out = compatible.flatMap((c) =>
			ZephyrBindingsLoader.getCompatibleKeys(c.name, node.parent)
				.map((compatKey) =>
					this.typeCache.get(key)?.get(compatKey)?.(node),
				)
				.filter((v) => !!v),
		);

		const allBusTypes = this.getBusTypes();

		const issues = compatible.flatMap((c) => {
			const match = ZephyrBindingsLoader.getCompatibleKeys(
				c.name,
				node.parent,
			).some((compatKey) => this.typeCache.get(key)?.has(compatKey));
			if (!match) {
				const busCompats = allBusTypes.filter((bus) =>
					this.typeCache.get(key)?.has(`${c.name}::${bus}`),
				);

				if (busCompats.length) {
					return genStandardTypeDiagnostic(
						StandardTypeIssue.BINDING_ON_BUS_NODE,
						c.ast,
						DiagnosticSeverity.Error,
						[],
						[],
						busCompats,
					);
				}
			}
			return match
				? []
				: [
						genStandardTypeDiagnostic(
							StandardTypeIssue.MISSING_BINDING_FILE,
							c.ast,
							DiagnosticSeverity.Hint,
							[],
							[DiagnosticTag.Unnecessary],
							[c.name],
						),
					];
		});

		return {
			type: out.length ? out : [getStandardType(node)],
			issues,
		};
	}

	loadTypeAndCache(folders: string | string[], key: string) {
		folders = Array.isArray(folders) ? folders : [folders];

		const bindings = folders
			.filter((f) => this.processedFolders.has(f))
			.flatMap((f) =>
				Array.from(this.zephyrBindingCache.entries()).flatMap(
					([ff, binding]) => (ff.startsWith(f) ? [binding] : []),
				),
			);

		bindings.push(
			...folders
				.filter((f) => !this.processedFolders.has(f))
				.flatMap((f) => {
					this.processedFolders.add(f);
					const g = glob.sync('**/*.yaml', {
						cwd: f,
						ignore: 'test/*',
					});
					return g
						.map((bindingFile) => {
							bindingFile = resolve(f, bindingFile);
							if (this.zephyrBindingCache.has(bindingFile)) {
								return this.zephyrBindingCache.get(
									bindingFile,
								)!;
							}
							try {
								const readData = yaml.parse(
									readFileSync(bindingFile, 'utf-8'),
								);
								const simplifiyedInclude = simplifiyInclude(
									readData?.include,
								);
								const obj = {
									...readData,
									bus: readData.bus
										? Array.isArray(readData.bus)
											? readData.bus
											: [readData.bus]
										: undefined,
									include: simplifiyedInclude,
									rawInclude: [...simplifiyedInclude],
									filePath: bindingFile,
								} as ZephyrBindingYml;
								this.zephyrBindingCache.set(bindingFile, obj);
								return obj;
							} catch (e) {
								console.warn(e);
							}
						})
						.filter((b) => !!b) as ZephyrBindingYml[];
				}),
		);

		const resolvedBindings = bindings
			.map((b) => {
				return resolveBinding(bindings, b);
			})
			.filter((b) => !!b && !b.include.length) as ZephyrBindingYml[];

		let typeCache = this.typeCache.get(key);
		if (!typeCache) {
			typeCache = new Map();
			typeCache.set('simple-bus', () => getSimpleBusType());
			this.typeCache.set(key, typeCache);
		}
		convertBindingsToType(resolvedBindings, typeCache);
	}

	getBindings(key: string) {
		return Array.from(this.typeCache.get(key)?.keys() ?? []).map(
			(b) => b.split('::', 1)[0],
		);
	}

	getBusTypes() {
		const busTypes = Array.from(this.zephyrBindingCache.values())
			.flatMap((b) => b.bus?.filter((v) => !!v) ?? [])
			.filter((v) => !!v);
		return Array.from(new Set(busTypes));
	}

	getDocumentLinks(
		document: TextDocument,
		folders: string[],
	): DocumentLink[] {
		const bindingFile = this.zephyrBindingCache.get(
			fileURLToPath(document.uri),
		);

		if (!bindingFile) return [];

		const text = document.getText();
		const links = bindingFile.rawInclude
			.map((include) => {
				const regex = new RegExp(include.name);
				const match = regex.exec(text);
				if (match) {
					const start = document.positionAt(match.index);
					const end = document.positionAt(
						match.index + match[0].length,
					);
					const path = Array.from(
						this.zephyrBindingCache.keys(),
					).find(
						(path) =>
							path.endsWith(`${p.sep}${include.name}`) &&
							folders.some((f) => path.startsWith(f)),
					);

					if (!path) {
						return;
					}

					return {
						range: Range.create(start, end),
						target: pathToFileURL(path),
					};
				}
			})
			.filter((l) => !!l);

		return links;
	}
}

let zephyrBindingsLoader: ZephyrBindingsLoader | undefined;
export const getZephyrBindingsLoader = () => {
	zephyrBindingsLoader ??= new ZephyrBindingsLoader();
	return zephyrBindingsLoader;
};

const convertBindingsToType = (
	bindings: ZephyrBindingYml[],
	map: Map<string, (node: Node) => NodeType>,
) => {
	return bindings.forEach((binding) => {
		if (binding.compatible) {
			map.set(
				binding['on-bus']
					? `${binding.compatible}::${binding['on-bus']}`
					: binding.compatible,
				(node: Node) => convertBindingToType(binding, node),
			);
		}
	});
};

const convertBindingToType = (binding: ZephyrBindingYml, node?: Node) => {
	const nodeType = getStandardType(node);
	nodeType.compatible = binding.compatible;
	nodeType.description = binding.description;
	nodeType.bindingsPath = binding.filePath;
	nodeType.bus =
		typeof binding.bus === 'string'
			? [binding.bus]
			: Array.from(new Set(binding.bus));
	nodeType.onBus = binding['on-bus'];
	binding.extends?.forEach((e) => nodeType.extends.add(e));
	nodeType.warnMismatchProperties = true;

	const cellsKeys = Object.keys(binding).filter((key) =>
		key.endsWith('-cells'),
	);
	const cellsValues = cellsKeys.map((k) => ({
		specifier: k.replace(/-cells$/, ''),
		values: binding![k as CellSpecifier],
	}));

	if (binding.properties) {
		Object.keys(binding.properties).forEach((name) => {
			const property = binding.properties![name];
			addToNodeType(nodeType, name, property);
			nodeType.cellsValues = cellsValues;
		});
	}

	if (binding['child-binding']) {
		const childBinding = binding['child-binding'];
		nodeType.childNodeType = (n: Node) =>
			convertBindingToType(childBinding, n);
	}

	return nodeType;
};

const addToNodeType = (
	nodeType: NodeType,
	name: string,
	property: ZephyrBindingsProperty,
) => {
	const existingProperty = nodeType.properties.find((p) =>
		p.getNameMatch(name),
	);
	if (existingProperty && typeof existingProperty.name === 'string') {
		existingProperty.required = () =>
			property.required ? 'required' : 'optional';
		existingProperty.values = () => property.enum ?? [];
		existingProperty.constValue = ZephyrDefaultTypeDefault(
			property.type,
			property.const,
		);
		existingProperty.bindingType = property.type;

		const additionalTypeCheck = existingProperty.additionalTypeCheck;
		existingProperty.additionalTypeCheck = (p, macros) => {
			return [
				...generateZephyrTypeCheck(
					property,
					name,
					existingProperty,
				)(p, macros),
				...(additionalTypeCheck?.(p, macros) ?? []),
			];
		};
	} else {
		let type =
			property.type === 'compound'
				? existingProperty?.type
				: ZephyrTypeToDTSType(property.type);
		type ??= ZephyrTypeToDTSType(property.type);
		const prop = new PropertyNodeType(
			name,
			type,
			property.required ? 'required' : 'optional',
			undefined, // TODO property.default ?,
			property.enum,
		);
		prop.additionalTypeCheck = (p, macros) => {
			const issues = [
				...(existingProperty?.additionalTypeCheck?.(p, macros) ?? []),
				...generateZephyrTypeCheck(property, name, prop)(p, macros),
			];
			prop.signatureArgs ??= existingProperty?.signatureArgs;
			prop.signatureArgsCyclic ??=
				!!existingProperty?.signatureArgsCyclic;
			return issues;
		};
		prop.description = property.description
			? [property.description]
			: existingProperty?.description;
		prop.bindingType = property.type;
		prop.constValue = ZephyrDefaultTypeDefault(
			property.type,
			property.const,
		);

		nodeType.addProperty(prop);
	}
};

const generateZephyrTypeCheck = (
	property: ZephyrBindingsProperty,
	name: string,
	type: PropertyNodeType,
) => {
	const myProperty = property;
	return (p: Property, macros: Map<string, MacroRegistryItem>) => {
		const root = p.parent.root;
		const issues: FileDiagnostic[] = [];

		if (myProperty.const) {
			const quickValues = p.ast.quickValues;
			if (quickValues?.length == 1) {
				const constValues = Array.isArray(myProperty.const)
					? myProperty.const
					: [myProperty.const];

				const equal =
					Array.isArray(quickValues[0]) &&
					constValues.length === quickValues[0].length &&
					quickValues[0].every(
						(v, i) =>
							(typeof v === 'number' && Number.isNaN(v)) ||
							constValues[i] === v,
					);

				if (!equal) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.EXPECTED_VALUE,
							p.ast.values ?? p.ast,
							DiagnosticSeverity.Error,
							[],
							[],
							[
								`Binding expects values to be "${myProperty.type}" with value: ${myProperty.const}`,
							],
						),
					);
				}
			}
		}

		if (myProperty.deprecated) {
			issues.push(
				genStandardTypeDiagnostic(
					StandardTypeIssue.DEPRECATED,
					p.ast,
					DiagnosticSeverity.Warning,
					[],
					[DiagnosticTag.Deprecated],
					[p.name],
				),
			);
		}

		if (
			myProperty.type === 'phandle' ||
			myProperty.type === 'phandles' ||
			myProperty.type === 'path'
		) {
			const values = flatNumberValues(p.ast.values);
			values?.forEach((v) => {
				const phandelValue = resolvePhandleNode(v, root);
				if (!phandelValue) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
							v,
							DiagnosticSeverity.Error,
						),
					);
				}
			});
		}

		if (
			myProperty.type === 'path' &&
			p.ast.values?.values.at(0)?.value instanceof StringValue
		) {
			const path = p.ast.values?.values.at(0)?.value as StringValue;

			const resolved: string[] = [];
			path.value.split('/').every((p) => {
				const node = root.getNode(p);
				if (!node) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.UNABLE_TO_RESOLVE_PATH,
							path,
							DiagnosticSeverity.Error,
							[],
							[],
							[p, `/${resolved.join('/')}`],
						),
					);
				} else {
					resolved.push(p);
				}
				return !node;
			});
		}

		const match = p.name.match(/^(.*)-(\d+)$/);
		if (myProperty.type === 'phandles' && match) {
			let parentName = '';
			if (name.endsWith('-gpios')) {
				parentName = 'gpio';
			} else {
				parentName = myProperty['specifier-space'] ?? match[1];
			}

			const index = Number.parseInt(match[2], 10);

			const nameProperty = p.parent.getProperty(`${parentName}-names`);
			if (nameProperty) {
				const names = nameProperty.ast.quickValues;
				if (!names?.at(index)) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.MISSING_VALUE_NAME,
							p.ast,
							DiagnosticSeverity.Warning,
							[nameProperty.ast],
							[],
							[p.name, index.toString()],
						),
					);
				}
			}
		}

		if (myProperty.type === 'phandle-array') {
			const values = flatNumberValues(p.ast.values);
			let i = 0;
			const args: string[][] = [];
			let index = 0;
			while (values && i < values.length) {
				const v = values.at(i);
				const phandelValue = resolvePhandleNode(v, root);
				if (!phandelValue) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
							v ?? p.ast,
							DiagnosticSeverity.Error,
						),
					);
					break;
				}

				let parentName = '';
				if (name.endsWith('-gpios')) {
					parentName = 'gpio';
				} else {
					parentName =
						myProperty['specifier-space'] ?? name.slice(0, -1);
				}

				const sizeCellProperty = phandelValue.getProperty(
					`#${parentName}-cells`,
				);

				if (!sizeCellProperty) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
							p.ast,
							DiagnosticSeverity.Error,
							[...phandelValue.nodeNameOrLabelRef],
							[],
							[
								p.name,
								`#${parentName}-cells`,
								`/${phandelValue.path.slice(1).join('/')}`,
							],
						),
					);
					break;
				}

				const sizeCellValue = sizeCellProperty
					? (getU32ValueFromProperty(
							sizeCellProperty,
							0,
							0,
							macros,
						) ?? 0)
					: 0;

				const cellNames = phandelValue.nodeType?.cellsValues?.find(
					(i) => i.specifier === parentName,
				)?.values;
				args.push([
					`${index}_phandel`,
					...(cellNames?.map((c) => `${index}_${c}`) ?? []),
					...Array.from(
						{
							length: sizeCellValue - (cellNames?.length ?? 0),
						},
						(_, j) =>
							`${index}_cell${
								sizeCellValue - (cellNames?.length ?? 0)
									? j
									: ''
							}`,
					),
				]);

				if (1 + sizeCellValue > values.length - i) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.CELL_MISS_MATCH,
							v ?? p.ast,
							DiagnosticSeverity.Error,
							[],
							[],
							[p.name, `<${args.at(-1)!.join(' ')}>`],
						),
					);
					break;
				}
				i += 1 + sizeCellValue;

				const mappingValuesAst = values.slice(i - sizeCellValue, i);
				const nexusMapping: NexuxMapping = {
					mappingValuesAst,
					specifierSpace: parentName,
					target: phandelValue,
				};

				p.nexusMapsTo.push(nexusMapping);

				const mapProperty = phandelValue.getProperty(
					`${parentName}-map`,
				);
				if (mapProperty) {
					const match = phandelValue.getNexusMapEntyMatch(
						parentName,
						macros,
						mappingValuesAst,
					);
					if (!match?.match) {
						issues.push(
							genStandardTypeDiagnostic(
								StandardTypeIssue.NO_NEXUS_MAP_MATCH,
								match.entry,
								DiagnosticSeverity.Error,
								[mapProperty.ast],
							),
						);
					} else {
						nexusMapping.mapItem = match.match;
					}
				}

				if (
					mappingValuesAst.every((ast) => ast instanceof Expression)
				) {
					phandelValue.spesifierNexusMapping.push({
						expressions: mappingValuesAst,
						node: p.parent,
						property: p,
					});
				}

				const nameProperty = p.parent.getProperty(
					`${parentName}-names`,
				);
				if (v && nameProperty) {
					const names = nameProperty.ast.quickValues;
					if (!names?.at(index)) {
						issues.push(
							genStandardTypeDiagnostic(
								StandardTypeIssue.MISSING_VALUE_NAME,
								new ASTBase(
									createTokenIndex(
										v.firstToken,
										values.at(i - 1)?.lastToken,
									),
								),
								DiagnosticSeverity.Warning,
								[nameProperty.ast],
								[],
								[p.name, index.toString()],
							),
						);
					}
				}

				index++;
			}

			args.push([`${index}_phandel`, `${index}_cell...`]);

			type.signatureArgs = args.map((arg) =>
				arg.map((arg) => ParameterInformation.create(arg)),
			);
		}

		return issues;
	};
};
