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

import path, { resolve, basename } from 'path';
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
	fileURLToPath,
	genStandardTypeDiagnostic,
	pathToFileURL,
} from '../../../helpers';
import { NexusMapping, Property } from '../../../context/property';

import {
	CellSpecifier,
	ChildNodeInclude,
	ZephyrBindingsProperty,
	ZephyrBindingYml,
	ZephyrPropertyType,
} from '../../../types/index';
import { getSimpleBusType } from '../../../dtsTypes/standardTypes/nodeTypes/simpleBus/node';
import { Expression } from '../../../ast/cPreprocessors/expression';

const ZephyrTypeToDTSType = (type: ZephyrPropertyType | undefined) => {
	switch (type) {
		case 'string':
			return generateOrTypeObj('STRING');
		case 'int':
			return generateOrTypeObj('U32');
		case 'boolean':
			return generateOrTypeObj('EMPTY');
		case 'array':
			return generateOrTypeObj('PROP_ENCODED_ARRAY');
		case 'uint8-array':
			return generateOrTypeObj('BYTESTRING');
		case 'string-array':
			return generateOrTypeObj('STRINGLIST');
		case 'phandle':
			return generateOrTypeObj('U32');
		case 'phandles':
			return generateOrTypeObj('PROP_ENCODED_ARRAY');
		case 'phandle-array':
			return generateOrTypeObj('PROP_ENCODED_ARRAY');
		case 'path':
			return generateOrTypeObj(['STRING', 'U32']);
		case 'compound':
			return generateOrTypeObj('ANY');
		default:
			return generateOrTypeObj('ANY');
	}
};

const ZephyrDefaultTypeDefault = (
	type: ZephyrPropertyType | undefined,
	def: any,
) => {
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
	Object.entries(binding.properties ?? {}).forEach(([name, prop]) => {
		prop.name = name;
	});
	binding.extends ??= [];
	binding = binding.include.reduce((p, c) => {
		const toMergeIn = bindings.find((b) => basename(b.filePath) === c.name);
		if (toMergeIn) {
			const propertiesToExclude = c['property-blocklist'];
			const propertiesToInclude = c['property-allowlist'];
			binding.extends?.push(
				...p.include.map((i) => basename(i.name, '.yaml')),
			);
			const childBindingFilter = c['child-binding'];
			p.include = p.include.filter((i) => i !== c);
			return (
				mergeAIntoB(
					bindings,
					toMergeIn,
					p,
					propertiesToExclude,
					propertiesToInclude,
					childBindingFilter,
				) ?? p
			);
		}
		console.warn(`Unable to find ${c.name}`);
		return p;
	}, binding);

	if (binding['child-binding']) {
		binding['child-binding'].include = simplifyInclude(
			binding['child-binding'].include,
		);

		binding['child-binding'] = resolveBinding(
			bindings,
			binding['child-binding'],
		);

		if (binding['child-binding']) {
			binding['child-binding'].isChildBinding = true;
		}
	}

	if (!binding.include.length) {
		return binding;
	}
};

const mergeAIntoB = (
	bindings: ZephyrBindingYml[],
	a: ZephyrBindingYml,
	b: ZephyrBindingYml,
	propertiesToExclude: string[] = [],
	propertiesToInclude?: string[],
	childBindingFilter?: ChildNodeInclude,
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
				? undefined
				: (resolvedA.properties?.[name] ?? undefined);
		const propertyFromB = resolvedB.properties?.[name] ?? undefined;

		if (propertyFromA || propertyFromB)
			newProperties = {
				...newProperties,
				[name]: {
					...(propertyFromA ?? {}),
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

	// merge children
	if (resolvedA['child-binding']) {
		resolvedB['child-binding'] ??= {
			filePath: resolvedB.filePath,
			include: [],
			rawInclude: [],
			isChildBinding: true,
		};
		mergeAIntoB(
			bindings,
			resolvedA['child-binding'],
			resolvedB['child-binding'],
			childBindingFilter?.['property-blocklist'],
			childBindingFilter?.['property-allowlist'],
			childBindingFilter?.['child-binding'],
		);
	}

	return resolvedB;
};

const simplifyInclude = (
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
	private contextBindingFiles = new WeakMap<ZephyrBindingYml, string[]>();

	static getCompatibleKeys(compatible: string, parent?: Node | null) {
		if (!parent || !parent.nodeType?.bus?.length) {
			return [compatible];
		}

		return [
			...parent.nodeType.bus.map((bus) => `${compatible}::${bus}`),
			compatible,
		];
	}

	getBaseZephyrType(key: string) {
		const folders = key.split(':');
		const bindings = Array.from(this.zephyrBindingCache.keys())
			.filter((p) => folders.some((f) => p.startsWith(f)))
			.flatMap((path) => this.zephyrBindingCache.get(path)!);

		return bindings.find((b) =>
			b.filePath.endsWith(`${path.sep}base.yaml`),
		);
	}

	getBaseNodeType(node: Node, key: string) {
		const base = this.getBaseZephyrType(key);
		const baseType = base ? convertBindingToType(base, node) : undefined;
		if (baseType) {
			baseType.warnMismatchProperties = false;
			const compat = baseType.properties.find(
				(p) => p.name === 'compatible',
			);
			if (compat) {
				compat.required = () => 'optional';
			}
		}
		return baseType;
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
			(v) => !!v,
		);

		const out =
			compatible?.flatMap((c) =>
				ZephyrBindingsLoader.getCompatibleKeys(c.name, node.parent)
					.map((compatKey) =>
						this.typeCache.get(key)?.get(compatKey)?.(node),
					)
					.filter((v) => !!v),
			) ?? [];

		if (!out.length) {
			const folders = key.split(':');
			const bindings = Array.from(this.zephyrBindingCache.keys())
				.filter((p) => folders.some((f) => p.startsWith(f)))
				.flatMap((path) => this.zephyrBindingCache.get(path)!);

			const base = bindings.find(
				(b) => basename(b.filePath) === `base.yaml`,
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

		const allBusTypes = this.getBusTypes();

		const issues =
			compatible?.flatMap((c) => {
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
							c.ast.firstToken,
							c.ast.lastToken,
							c.ast,
							{ templateStrings: busCompats },
						);
					}
				}
				return match
					? []
					: [
							genStandardTypeDiagnostic(
								StandardTypeIssue.MISSING_BINDING_FILE,
								c.ast.firstToken,
								c.ast.lastToken,
								c.ast,
								{
									severity: DiagnosticSeverity.Hint,
									tags: [DiagnosticTag.Unnecessary],
									templateStrings: [c.name],
								},
							),
						];
			}) ?? [];

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
								const simplifiedInclude = simplifyInclude(
									readData?.include,
								);
								const obj = {
									...readData,
									bus: readData.bus
										? Array.isArray(readData.bus)
											? readData.bus
											: [readData.bus]
										: undefined,
									include: simplifiedInclude,
									rawInclude: [...simplifiedInclude],
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
			this.typeCache.set(key, typeCache);
		}

		resolvedBindings.forEach((b) => {
			const keys = this.contextBindingFiles.get(b);
			if (!keys) {
				this.contextBindingFiles.set(b, [key]);
			} else {
				keys.push(key);
			}
		});

		convertBindingsToType(resolvedBindings, typeCache);

		if (!typeCache.has('simple-bus')) {
			const baseZephyr = this.getBaseZephyrType(key);
			if (baseZephyr) {
				const simpleBus = convertSimpleBusToType(baseZephyr);
				typeCache.set('simple-bus', () => simpleBus);
			}
		}
	}

	getBindings(key: string) {
		return Array.from(this.typeCache.get(key)?.keys() ?? []).map(
			(b) => b.split('::', 1)[0],
		);
	}

	getZephyrContextBinding(key: string) {
		return Array.from(this.zephyrBindingCache.values()).filter((b) =>
			this.contextBindingFiles.get(b)?.includes(key),
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

	resetCache(key: string) {
		this.typeCache.delete(key);
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
	nodeType.zephyrBinding = binding;
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
		values: binding[k as CellSpecifier],
	}));
	nodeType.cellsValues = cellsValues;

	Object.entries(binding.properties ?? {}).forEach(([name, property]) => {
		addToNodeType(nodeType, name, property);
	});

	if (binding['child-binding']) {
		const childBinding = binding['child-binding'];
		nodeType.childNodeType = (n: Node) => {
			const binding = convertBindingToType(childBinding, n);
			binding.hasParentBinding = true;
			return binding;
		};
	}

	return nodeType;
};

const convertSimpleBusToType = (binding: ZephyrBindingYml) => {
	const nodeType = getSimpleBusType();
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
		values: binding[k as CellSpecifier],
	}));
	nodeType.cellsValues = cellsValues;

	Object.entries(binding.properties ?? {}).forEach(([name, property]) => {
		addToNodeType(nodeType, name, property);
	});

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
		if (existingProperty.name !== 'reg') {
			existingProperty.required = () =>
				property.required ? 'required' : 'optional';
		} else if (property.required) {
			existingProperty.required = () => 'required';
		}
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
			const values = p.ast.getFlatAstValues();
			if (
				values?.length == 1 &&
				values.every((v) => v instanceof Expression)
			) {
				const evaluatedValues = values.map((v) => v.evaluate(macros));
				const constValues = Array.isArray(myProperty.const)
					? myProperty.const
					: [myProperty.const];

				const equal =
					constValues.length === evaluatedValues.length &&
					evaluatedValues.every(
						(v, i) =>
							(typeof v === 'number' && Number.isNaN(v)) ||
							constValues[i] === v,
					);

				if (!equal) {
					const issueAst = p.ast.values ?? p.ast;
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.EXPECTED_VALUE,
							issueAst.firstToken,
							issueAst.lastToken,
							issueAst,
							{
								templateStrings: [
									`Binding expects values to be "${myProperty.type}" with value: ${myProperty.const}`,
								],
							},
						),
					);
				}
			}
		}

		if (myProperty.deprecated) {
			issues.push(
				genStandardTypeDiagnostic(
					StandardTypeIssue.DEPRECATED,
					p.ast.firstToken,
					p.ast.lastToken,
					p.ast,
					{
						severity: DiagnosticSeverity.Warning,
						tags: [DiagnosticTag.Deprecated],
						templateStrings: [p.name],
					},
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
				const pHandleValue = resolvePhandleNode(v, root);
				if (!pHandleValue) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
							v.firstToken,
							v.lastToken,
							v,
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
							path.firstToken,
							path.lastToken,
							path,
							{ templateStrings: [p, `/${resolved.join('/')}`] },
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
							p.ast.firstToken,
							p.ast.lastToken,
							p.ast,
							{
								severity: DiagnosticSeverity.Warning,
								linkedTo: [nameProperty.ast],
								templateStrings: [p.name, index.toString()],
							},
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
				const pHandleValue = resolvePhandleNode(v, root);
				if (!pHandleValue) {
					const issueAst = v ?? p.ast;
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.UNABLE_TO_RESOLVE_PHANDLE,
							issueAst.firstToken,
							issueAst.lastToken,
							issueAst,
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

				const sizeCellProperty = pHandleValue.getProperty(
					`#${parentName}-cells`,
				);

				if (!sizeCellProperty) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
							p.ast.firstToken,
							p.ast.lastToken,
							p.ast,
							{
								linkedTo: [...pHandleValue.nodeNameOrLabelRef],
								templateStrings: [
									p.name,
									`#${parentName}-cells`,
									`/${pHandleValue.path.slice(1).join('/')}`,
								],
							},
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

				const cellNames = pHandleValue.nodeType?.cellsValues?.find(
					(i) => i.specifier === parentName,
				)?.values;
				args.push([
					`${index}_phandle`,
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
					const issueAst = v ?? p.ast;
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.CELL_MISS_MATCH,
							issueAst.firstToken,
							issueAst.lastToken,
							issueAst,
							{
								templateStrings: [
									p.name,
									`<${args.at(-1)!.join(' ')}>`,
								],
							},
						),
					);
					break;
				}
				i += 1 + sizeCellValue;

				const mappingValuesAst = values.slice(i - sizeCellValue, i);
				const nexusMapping: NexusMapping = {
					mappingValuesAst,
					specifierSpace: parentName,
					target: pHandleValue,
				};

				p.nexusMapsTo.push(nexusMapping);

				const mapProperty = pHandleValue.getProperty(
					`${parentName}-map`,
				);
				if (mapProperty) {
					const match = pHandleValue.getNexusMapEntryMatch(
						parentName,
						macros,
						mappingValuesAst,
					);
					if (!match?.match) {
						issues.push(
							genStandardTypeDiagnostic(
								StandardTypeIssue.NO_NEXUS_MAP_MATCH,
								match.entry.firstToken,
								match.entry.lastToken,
								match.entry,
								{ linkedTo: [mapProperty.ast] },
							),
						);
					} else {
						nexusMapping.mapItem = match.match;
					}
				}

				if (
					mappingValuesAst.every((ast) => ast instanceof Expression)
				) {
					pHandleValue.spesifierNexusMapping.push({
						expressions: mappingValuesAst,
						node: p.parent,
						property: p,
						specifierSpace: parentName,
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
								v.firstToken,
								values[i - 1]?.lastToken,
								p.ast,
								{
									severity: DiagnosticSeverity.Warning,
									linkedTo: [nameProperty.ast],
									templateStrings: [p.name, index.toString()],
								},
							),
						);
					}
				}

				index++;
			}

			args.push([`${index}_phandle`, `${index}_cell...`]);

			type.signatureArgs = args.map((arg) =>
				arg.map((arg) => ParameterInformation.create(arg)),
			);
		}

		return issues;
	};
};
