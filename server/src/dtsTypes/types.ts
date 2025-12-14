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

import {
	CompletionItem,
	CompletionItemKind,
	DiagnosticSeverity,
	DiagnosticTag,
	MarkupContent,
	MarkupKind,
	ParameterInformation,
	Position,
	SignatureHelp,
	SignatureInformation,
	TextEdit,
} from 'vscode-languageserver';
import {
	genStandardTypeDiagnostic,
	isNestedArray,
	toRangeWithTokenIndex,
} from '../helpers';
import { type Node } from '../context/node';
import { Property } from '../context/property';
import { FileDiagnostic, MacroRegistryItem, StandardTypeIssue } from '../types';
import { Runtime } from '../context/runtime';
import { PropertyValue } from '../ast/dtc/values/value';
import { StringValue } from '../ast/dtc/values/string';
import { ASTBase } from '../ast/base';
import { ArrayValues } from '../ast/dtc/values/arrayValue';
import { LabelRef } from '../ast/dtc/labelRef';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { getNodeNameOrNodeLabelRef } from '../ast/helpers';
import { countParent } from '../formatting/getDocumentFormatting';
import {
	BindingPropertyType as PropertyType,
	TypeConfig,
} from '../types/index';

function propertyTypeToString(type: PropertyType): string {
	switch (type) {
		case PropertyType.EMPTY:
			return `EMPTY`;
		case PropertyType.U32:
			return `U32`;
		case PropertyType.U64:
			return `U64`;
		case PropertyType.STRING:
			return `STRING`;
		case PropertyType.PROP_ENCODED_ARRAY:
			return `PROP_ENCODED_ARRAY`;
		case PropertyType.STRINGLIST:
			return `STRINGLIST`;
		case PropertyType.BYTESTRING:
			return `BYTESTRING`;
		case PropertyType.ANY:
			return `ANY`;
		case PropertyType.UNKNOWN:
			return `UNKNOWN`;
	}
}

export type RequirementStatus = 'required' | 'omitted' | 'optional';

export class PropertyNodeType<T = string | number> {
	public required: (node: Node) => RequirementStatus;
	public readonly allowedValues: T[] | undefined;
	public values: (property: Property) => T[];
	public hideAutoComplete = false;
	public list = false;
	public bindingType?: string;
	public description?: string[];
	public examples?: string[];
	public constValue?: number | string | number[] | string[];
	public onHover = (): MarkupContent => {
		return {
			kind: MarkupKind.Markdown,
			value: [
				'### Type',
				`**DTS native type**  `,
				`${this.type
					.map((t) => t.types.map(propertyTypeToString).join(' or '))
					.join(',')}
          
          `,
				...(this.bindingType
					? [
							`**Binding type**  `,
							`${this.bindingType}
        
        `,
						]
					: []),
				...(this.description
					? ['### Description', this.description.join('\n\n')]
					: []),
				...(this.examples
					? ['### Example', this.examples.join('\n\n')]
					: []),
			].join('\n'),
		};
	};

	public signatureArgs?: ParameterInformation[] | ParameterInformation[][];
	public signatureArgsCyclic = false;

	constructor(
		public readonly name: string | RegExp,
		public type: TypeConfig[],
		required:
			| RequirementStatus
			| ((node: Node) => RequirementStatus) = 'optional',
		public readonly def: T | undefined = undefined,
		values?: T[] | ((property: Property) => T[]),
		public additionalTypeCheck?: (
			property: Property,
			macros: Map<string, MacroRegistryItem>,
		) => FileDiagnostic[],
	) {
		if (typeof required !== 'function') {
			this.required = () => required;
		} else {
			this.required = required;
		}

		if (typeof values !== 'function') {
			this.allowedValues = values;
			this.values = () => {
				if (values === undefined) {
					return def ? [def] : [];
				}

				return def && values.indexOf(def) === -1
					? [def, ...values]
					: values;
			};
		} else {
			this.values = values;
		}
	}

	getNameMatch(name: string): boolean {
		return typeof this.name === 'string'
			? this.name === name
			: this.name.test(name);
	}

	validateProperty(
		runtime: Runtime,
		node: Node,
		propertyName: string,
		property?: Property,
	): FileDiagnostic[] {
		const required = this.required(node);
		if (!property) {
			if (required === 'required') {
				const childOrRefNode = runtime.getOrderedNodeAst(node);
				const orderedTree = getNodeNameOrNodeLabelRef(childOrRefNode);

				let assignTest = '';
				if (this.type.length === 1 && this.type[0].types.length === 1) {
					switch (this.type[0].types[0]) {
						case PropertyType.U32:
						case PropertyType.U64:
						case PropertyType.PROP_ENCODED_ARRAY:
							assignTest = ` = <${propertyName === 'reg' && node.address ? node.address.map((m) => `0x${m.toString(16)}`).join(' ') : ''}>`;
							break;
						case PropertyType.STRING:
						case PropertyType.STRINGLIST:
							assignTest = ' = ""';
							break;
						case PropertyType.BYTESTRING:
							assignTest = ' = []';
							break;
					}
				}

				return [
					...childOrRefNode.map((node, i) => {
						const token =
							node.openScope ?? orderedTree[i].lastToken;

						const item = orderedTree[i];
						return genStandardTypeDiagnostic(
							StandardTypeIssue.REQUIRED,
							item.firstToken,
							item.lastToken,
							item,
							{
								templateStrings: [propertyName],
								edit: TextEdit.insert(
									Position.create(
										token.pos.line,
										token.pos.col + 1,
									),
									`\n${''.padEnd(
										countParent(orderedTree[i].uri, node),
										runtime.context.formattingOptions
											.insertSpaces
											? ' '.repeat(
													runtime.context
														.formattingOptions
														.tabSize,
												)
											: '\t',
									)}${propertyName}${assignTest};`,
								),
							},
						);
					}),
				];
			}

			return [];
		} else if (required === 'omitted') {
			return [
				genStandardTypeDiagnostic(
					StandardTypeIssue.OMITTED,
					property.ast.firstToken,
					property.ast.lastToken,
					property.ast,
					{ templateStrings: [propertyName] },
				),
			];
		}

		const propTypes = propertyValuesToPropertyType(property);
		const issues: FileDiagnostic[] = [];

		const checkType = (
			expected: PropertyType[],
			type: PropertyType,
			ast: ASTBase | undefined | null,
		) => {
			ast ??= property.ast;

			const typeIsValid =
				expected.some((tt) => tt == type) ||
				(expected.some((tt) => tt == PropertyType.STRINGLIST) &&
					(type === PropertyType.STRING ||
						type === PropertyType.STRINGLIST)) ||
				(expected.some((tt) => tt == PropertyType.PROP_ENCODED_ARRAY) &&
					(type === PropertyType.U32 || type === PropertyType.U64));

			if (!typeIsValid) {
				const issue: StandardTypeIssue[] = [];
				expected.forEach((tt) => {
					switch (tt) {
						case PropertyType.EMPTY:
							issue.push(StandardTypeIssue.EXPECTED_EMPTY);
							break;
						case PropertyType.STRING:
							issue.push(StandardTypeIssue.EXPECTED_STRING);
							break;
						case PropertyType.STRINGLIST:
							issue.push(StandardTypeIssue.EXPECTED_STRINGLIST);
							break;
						case PropertyType.U32:
							issue.push(StandardTypeIssue.EXPECTED_U32);
							break;
						case PropertyType.U64:
							issue.push(StandardTypeIssue.EXPECTED_U64);
							break;
						case PropertyType.PROP_ENCODED_ARRAY:
							issue.push(
								StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
							);
							break;
					}
				});

				if (issue.length) {
					issues.push(
						genStandardTypeDiagnostic(
							issue,
							ast.firstToken,
							ast.lastToken,
							ast,
							{
								templateStrings: [property.name],
							},
						),
					);
				}
			}
		};

		if (this.type[0].types.some((e) => e === PropertyType.ANY)) {
			return [];
		}

		if (this.type.length > 1) {
			const type = this.type;
			if (!this.list && this.type.length !== propTypes.length) {
				const issueAst = property.ast.values ?? property.ast;
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH,
						issueAst.firstToken,
						issueAst.lastToken,
						issueAst,
						{
							templateStrings: [
								propertyName,
								this.type.length.toString(),
							],
						},
					),
				);
			} else {
				propTypes.forEach((t, i) => {
					if (type[0].types.every((tt) => tt !== t)) {
						const issueAst =
							property.ast.values?.values[i] ?? property.ast;
						issues.push(
							genStandardTypeDiagnostic(
								StandardTypeIssue.EXPECTED_STRINGLIST,
								issueAst.firstToken,
								issueAst.lastToken,
								issueAst,
							),
						);
					}
				});
			}
		} else {
			if (
				this.type[0].types.some((tt) => tt === PropertyType.STRINGLIST)
			) {
				propTypes.some((t) =>
					checkType(
						[PropertyType.STRINGLIST],
						t,
						property.ast.values?.values[0]?.value,
					),
				);
			} else if (
				this.list ||
				(this.type.length === 1 &&
					this.type[0].types
						.filter((t) => t !== PropertyType.EMPTY)
						.every((tt) => tt === PropertyType.PROP_ENCODED_ARRAY))
			) {
				propTypes.some((t) =>
					checkType(
						this.type[0].types,
						t,
						property.ast.values?.values[0]?.value,
					),
				);
			} else if (
				propTypes.length > 1 &&
				this.type[0].types.some((tt) => tt !== PropertyType.EMPTY)
			) {
				const issueAst = property.ast.propertyName ?? property.ast;
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.EXPECTED_ONE,
						issueAst.firstToken,
						issueAst.lastToken,
						issueAst,
						{
							linkedTo: (
								property.ast.values?.values.slice(1) ?? []
							).filter((v) => !!v),
							templateStrings: [property.name],
						},
					),
				);
			} else if (propTypes.length === 1) {
				checkType(
					this.type[0].types,
					propTypes[0],
					property.ast.values?.values[0]?.value,
				);
			}

			const values = this.values(property);
			// we have the right type
			if (issues.length === 0) {
				issues.push(
					...(this.additionalTypeCheck?.(
						property,
						runtime.context.macros,
					) ?? []),
				);
				if (
					values.length &&
					this.type[0].types.some((tt) => tt === PropertyType.STRING)
				) {
					const currentValue = property.ast.values?.values[0]
						?.value as StringValue;
					if (!values.some((v) => currentValue.value === v)) {
						const issueAst =
							property.ast.values?.values[0]?.value ??
							property.ast;
						issues.push(
							genStandardTypeDiagnostic(
								StandardTypeIssue.EXPECTED_ENUM,
								issueAst.firstToken,
								issueAst.lastToken,
								issueAst,
								{
									templateStrings: [
										this.values(property)
											.map((v) => `'${v}'`)
											.join(' or '),
									],
								},
							),
						);
					}
				}
			}
		}

		return issues;
	}

	getPropertyCompletionItems(
		property: Property,
		valueIndex: number,
		inValue: boolean,
	): CompletionItem[] {
		const currentValue = this.type.at(valueIndex);

		if (currentValue?.types.some((tt) => tt === PropertyType.STRING)) {
			if (
				property.ast.values?.values &&
				property.ast.values.values?.length > 1
			) {
				return [];
			}

			return this.values(property).map((v) => ({
				label: `"${v}"`,
				kind: CompletionItemKind.Variable,
				sortText: v === this.def ? `A${v}` : `Z${v}`,
				insertText: inValue ? `${v}` : `"${v}"`,
			}));
		}

		if (
			currentValue?.types.some(
				(tt) => tt === PropertyType.U32 || tt === PropertyType.U64,
			)
		) {
			return this.values(property).map((v) => ({
				label: `<${v}>`,
				kind: CompletionItemKind.Variable,
				sortText: v === this.def ? `A${v}` : `Z${v}`,
				insertText: inValue ? `${v}` : `<${v}>`,
			}));
		}

		return [];
	}
}

const propertyValuesToPropertyType = (property: Property): PropertyType[] => {
	return property.ast.values
		? property.ast.values.values.map((v) => propertyValueToPropertyType(v))
		: [PropertyType.EMPTY];
};

const propertyValueToPropertyType = (
	value: PropertyValue | null,
): PropertyType => {
	if (!value) {
		return PropertyType.UNKNOWN;
	}
	if (value.value instanceof StringValue) {
		return PropertyType.STRING;
	}

	if (value.value instanceof ArrayValues) {
		if (value.value.values.length === 1) {
			return PropertyType.U32;
		} else if (value.value.values.length === 2) {
			return PropertyType.U64;
		} else {
			return PropertyType.PROP_ENCODED_ARRAY;
		}
	}

	if (value.value instanceof LabelRef || value.value instanceof NodePathRef) {
		return PropertyType.U32;
	}

	return PropertyType.BYTESTRING;
};

export abstract class INodeType {
	abstract getIssue(runtime: Runtime, node: Node): FileDiagnostic[];
	abstract getOnPropertyHover(name: string): MarkupContent | undefined;
	abstract getSignatureHelp(
		property: Property,
		ast: ASTBase,
		beforeAst?: ASTBase,
		afterAst?: ASTBase,
	): SignatureHelp | undefined;
	abstract childNodeType: ((node: Node) => INodeType) | undefined;
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
	extends: Set<string> = new Set();
	abstract getPropertyListCompletionItems(node: Node): CompletionItem[];
}

export class NodeType extends INodeType {
	#properties: PropertyNodeType[] = [];
	public noMismatchPropertiesAllowed = false;
	public warnMismatchProperties = false;
	#childNodeType?: (node: Node) => NodeType;

	constructor(
		public additionalValidations: (
			runtime: Runtime,
			node: Node,
		) => FileDiagnostic[] = () => [],
	) {
		super();
	}

	getIssue(runtime: Runtime, node: Node) {
		const issue: FileDiagnostic[] = [];

		if (node.disabled) {
			const statusProperty = node.getProperty('status');
			[...node.definitions, ...node.referencedBy].forEach((n) =>
				issue.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.NODE_DISABLED,
						n.firstToken,
						n.lastToken,
						n,
						{
							severity: DiagnosticSeverity.Hint,
							linkedTo: [
								...(statusProperty?.ast
									? [statusProperty?.ast]
									: []),
							],
							tags: [DiagnosticTag.Unnecessary],
						},
					),
				),
			);
			return issue;
		}

		const machedSet = new Set<Property>();

		const propIssues = this.properties.flatMap((propType) => {
			if (
				propType.name === 'reg' &&
				propType.required(node) === 'required' &&
				!node.address &&
				node.properties.find((p) => p.name === 'reg')
			) {
				const nodeAddress = node
					.regArray(runtime.context.macros)
					?.at(0)
					?.startAddress.map((a) => a.toString(16))
					.join(',');
				const issueAst =
					node.definitions.at(-1)!.name ?? node.definitions.at(-1)!;
				issue.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.EXPECTED_NODE_ADDRESS,
						issueAst.firstToken,
						issueAst.lastToken,
						issueAst,
						{
							linkedTo: node.definitions
								.slice(0, -1)
								.map((n) => n.name ?? n),
							edit: nodeAddress
								? node.definitions
										.filter((n) => !!n.name)
										.map((n) =>
											TextEdit.insert(
												Position.create(
													n.name!.lastToken.pos.line,
													n.name!.lastToken.pos
														.colEnd,
												),
												`@${nodeAddress}`,
											),
										)
								: undefined,
							codeActionTitle: 'Add Node Address',
						},
					),
				);
			}
			if (typeof propType.name === 'string') {
				const property = node.getProperty(propType.name);
				if (property) machedSet.add(property);
				return propType.validateProperty(
					runtime,
					node,
					propType.name,
					property,
				);
			}

			const properties = node.properties.filter((p) =>
				propType.getNameMatch(p.name),
			);

			properties.forEach((p) => machedSet.add(p));

			const ddd = this.properties.filter((t) => t !== propType) ?? [];

			if (
				ddd.length &&
				properties.some((p) => ddd.some((d) => d.getNameMatch(p.name)))
			) {
				return [];
			}

			return properties.flatMap((p) =>
				propType.validateProperty(runtime, node, p.name, p),
			);
		});

		if (
			machedSet.size !== node.properties.length &&
			(this.noMismatchPropertiesAllowed || this.warnMismatchProperties)
		) {
			const mismatch = node.properties.filter((p) => !machedSet.has(p));
			mismatch.forEach((p) => {
				if (
					runtime.context.bindingLoader?.type === 'Zephyr' &&
					p.name.endsWith('-controller')
				) {
					// this is allowe in Zephyr
					// https://github.com/zephyrproject-rtos/zephyr/blob/0f5e03f1fcba4326baf4507c343f3609bf32c524/scripts/dts/python-devicetree/src/devicetree/edtlib.py#L1657-L1662
					return;
				}
				issue.push(
					genStandardTypeDiagnostic(
						this.warnMismatchProperties
							? StandardTypeIssue.PROPERTY_NOT_IN_BINDING
							: StandardTypeIssue.PROPERTY_NOT_ALLOWED,
						p.ast.firstToken,
						p.ast.lastToken,
						p.ast,
						{
							severity: this.warnMismatchProperties
								? DiagnosticSeverity.Warning
								: DiagnosticSeverity.Error,
							templateStrings: [p.name],
							edit: TextEdit.del(
								toRangeWithTokenIndex(
									p.ast.firstToken.prevToken,
									p.ast.lastToken,
									false,
								),
							),
						},
					),
				);
			});
		}

		return [
			...issue,
			...propIssues,
			...this.additionalValidations(runtime, node),
		];
	}

	get properties() {
		return this.#properties;
	}

	addProperty(property: PropertyNodeType | PropertyNodeType[]) {
		if (Array.isArray(property)) {
			property.forEach((p) => this.#properties.push(p));
		} else {
			this.#properties.push(property);
		}
		this.#properties.sort((a, b) => {
			if (typeof a.name === 'string' && typeof b.name === 'string')
				return 0;
			if (typeof a.name !== 'string' && typeof b.name !== 'string')
				return 0;
			if (typeof a.name === 'string') return -1;
			return 1;
		});
	}

	get childNodeType() {
		return this.#childNodeType;
	}

	set childNodeType(nodeType: ((node: Node) => NodeType) | undefined) {
		if (!nodeType) {
			return;
		}

		this.#childNodeType = (node: Node) => {
			const type = nodeType(node);
			type.bindingsPath = this.bindingsPath;
			return type;
		};
	}

	getOnPropertyHover(name: string) {
		const typeFound = this.properties.find((p) => p.getNameMatch(name));
		return typeFound?.onHover.bind(typeFound)();
	}

	getSignatureHelp(
		property: Property,
		ast: ASTBase,
		beforeAst?: ASTBase,
		afterAst?: ASTBase,
	) {
		const typeFound = this.properties.find((p) =>
			p.getNameMatch(property.name),
		);

		let signatureArgs = typeFound?.signatureArgs;

		if (!typeFound || !signatureArgs) {
			return;
		}

		const beforeIndex = property.getArgumentIndex(beforeAst);
		const afterIndex = property.getArgumentIndex(afterAst);
		const thisIndex = property.getArgumentIndex(ast);

		let argIndex =
			thisIndex ??
			afterIndex ??
			(beforeIndex !== undefined ? beforeIndex + 1 : undefined);

		if (isNestedArray(signatureArgs)) {
			let sum = 0;
			if (argIndex !== undefined) {
				const argIndexTemp = argIndex;
				const grpIndex = argIndex
					? signatureArgs.findIndex((args) => {
							if (
								sum <= argIndexTemp &&
								args.length + sum > argIndexTemp
							) {
								return true;
							}

							sum += args.length;
							return false;
						})
					: undefined;

				if (grpIndex !== undefined) {
					if (grpIndex > 1) {
						argIndex =
							argIndex -
							signatureArgs
								.slice(0, grpIndex - 1)
								.reduce((a, b) => a + b.length, 0);
					}
					signatureArgs = signatureArgs.slice(
						grpIndex ? grpIndex - 1 : 0,
						grpIndex + 2,
					);
				}
			}

			return {
				signatures: [
					SignatureInformation.create(
						`${property.name} = ${signatureArgs
							.map(
								(t) =>
									`<${t.map((arg) => arg.label).join(' ')}>`,
							)
							.join(', \n\t\t')};`,
						this.description,
						...signatureArgs.flat(),
					),
				],
				activeSignature: 0,
				activeParameter: argIndex,
			};
		}

		if (typeFound.signatureArgsCyclic && argIndex) {
			argIndex = argIndex % signatureArgs.length;
		}

		return {
			signatures: [
				SignatureInformation.create(
					`${property.name} = <${signatureArgs
						.map((arg) => arg.label)
						.join(' ')}>;`,
					this.description,
					...signatureArgs,
				),
			],
			activeSignature: 0,
			activeParameter: argIndex,
		};
	}

	getPropertyListCompletionItems(node: Node) {
		return (
			this.properties
				.filter(
					(p) =>
						!p.hideAutoComplete &&
						p.required(node) !== 'omitted' &&
						typeof p.name === 'string',
				)
				.map((p) => {
					const required = node && p.required(node);
					const hasProperty = !!node.properties.some((pp) =>
						p.getNameMatch(pp.name),
					);
					let sortLetter = 'a';
					if (required === 'required') {
						sortLetter = hasProperty ? 'Y' : '!';
					} else {
						sortLetter = hasProperty ? 'Z' : 'B';
					}

					return {
						label: `${p.name}`,
						kind: CompletionItemKind.Property,
						sortText: `${sortLetter}${p.name}`,
					};
				}) ?? []
		);
	}
}
