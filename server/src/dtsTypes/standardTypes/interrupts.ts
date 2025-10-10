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

import { ParameterInformation } from 'vscode-languageserver';
import { BindingPropertyType } from '../../types/index';
import { FileDiagnostic, StandardTypeIssue } from '../../types';
import { PropertyNodeType } from '../types';
import { genStandardTypeDiagnostic } from '../../helpers';
import { Expression } from '../../ast/cPreprocessors/expression';
import { NexusMapping } from '../../context/property';
import {
	flatNumberValues,
	generateOrTypeObj,
	getU32ValueFromProperty,
} from './helpers';

export default () => {
	const prop = new PropertyNodeType<number>(
		'interrupts',
		generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
		'optional',
		undefined,
		undefined,
		(property, macros) => {
			const issues: FileDiagnostic[] = [];

			const values = flatNumberValues(property.ast.values);
			if (!values) {
				return issues;
			}

			const node = property.parent;

			// in this case we can leve it up to interrupts-extended to validate as this prop
			// is to be ignored
			if (node.getProperty('interrupts-extended')) {
				return issues;
			}

			const result = node.interruptsParent;

			if (!result?.parentInterruptNode) {
				if (!result?.interruptParent) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
							property.ast.firstToken,
							property.ast.lastToken,
							property.ast,
							{
								linkedTo: [
									...property.parent.nodeNameOrLabelRef,
								],
								templateStrings: [
									property.name,
									'interrupt-parent',
									property.parent.pathString,
								],
							},
						),
					);
					return issues;
				}
				const issueAST =
					result.interruptParent.ast.values?.values.at(0)?.value ??
					result.interruptParent.ast;

				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
						issueAST.firstToken,
						issueAST.lastToken,
						issueAST,
					),
				);
				return issues;
			}

			const { parentInterruptNode } = result;

			const childInterruptSpecifier =
				parentInterruptNode.getProperty('#interrupt-cells');

			if (!childInterruptSpecifier) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
						property.ast.firstToken,
						property.ast.lastToken,
						property.ast,
						{
							linkedTo: [
								...parentInterruptNode.nodeNameOrLabelRef,
							],
							templateStrings: [
								property.name,
								'#interrupt-cells',
								parentInterruptNode.pathString,
							],
						},
					),
				);
				return issues;
			}

			const childInterruptSpecifierValue = getU32ValueFromProperty(
				childInterruptSpecifier,
				0,
				0,
				macros,
			);

			if (!childInterruptSpecifierValue) {
				return issues;
			}

			let args: string[] = [
				...Array.from(
					{
						length: childInterruptSpecifierValue,
					},
					() => 'Interrupt',
				),
			];

			const cells = parentInterruptNode.bindingLoader?.type
				? parentInterruptNode.nodeType?.cellsValues?.find(
						(c) => c.specifier === 'interrupt',
					)
				: undefined;
			if (cells) {
				args = cells.values;
				prop.signatureArgs = cells.values.map((arg) =>
					ParameterInformation.create(arg),
				);
			} else {
				prop.signatureArgs = args.map((arg) =>
					ParameterInformation.create(arg),
				);
			}

			const mapProperty =
				parentInterruptNode.getProperty(`interrupt-map`);
			const addressCellsProperty =
				node.parent?.getProperty(`#address-cells`);
			if (mapProperty && !addressCellsProperty) {
				const issueAST = property.ast.propertyName ?? property.ast;
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
						issueAST.firstToken,
						issueAST.lastToken,
						issueAST,
						{
							linkedTo: [...property.parent.nodeNameOrLabelRef],
							templateStrings: [
								property.name,
								'#address-cells',
								node.parent?.pathString ?? '/',
							],
						},
					),
				);
			}

			if (!childInterruptSpecifier) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
						property.ast.firstToken,
						property.ast.lastToken,
						property.ast,
						{
							linkedTo: [
								...parentInterruptNode.nodeNameOrLabelRef,
							],
							templateStrings: [
								property.name,
								'#interrupt-cells',
								parentInterruptNode.pathString,
							],
						},
					),
				);

				return issues;
			}

			let i = 0;
			while (i < values.length) {
				const remaining = values.length - i;

				if (childInterruptSpecifierValue > remaining) {
					const valueItem = values[values.length - 1];
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.CELL_MISS_MATCH,
							valueItem.firstToken,
							valueItem.lastToken,
							valueItem,
							{
								templateStrings: [
									property.name,
									`<${args.join(' ')}> `,
								],
							},
						),
					);
					return issues;
				}

				const mappingValuesAst = values.slice(
					i,
					i + childInterruptSpecifierValue,
				);

				const startAddress = node
					.mappedReg(macros)
					?.at(0)?.startAddress;
				const nexusMapping: NexusMapping = {
					mappingValuesAst,
					target: parentInterruptNode,
				};

				property.nexusMapsTo.push(nexusMapping);

				if (mapProperty && startAddress) {
					const match = parentInterruptNode.getNexusMapEntryMatch(
						'interrupt',
						macros,
						mappingValuesAst,
						startAddress,
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
					parentInterruptNode.interrupControlerMapping.push({
						expressions: mappingValuesAst,
						node,
						property,
					});
				}

				i += childInterruptSpecifierValue;
			}

			return issues;
		},
	);
	prop.description = [
		'The interrupts property of a device node defines the interrupt or interrupts that are generated by the device.The value of the interrupts property consists of an arbitrary number of interrupt specifiers. The format of an interrupt specifier is defined by the binding of the interrupt domain root.',
		'interrupts is overridden by the interrupts-extended property and normally only one or the other should be used.',
	];
	prop.examples = [
		'A common definition of an interrupt specifier in an open PIC-compatible interrupt domain consists of two cells; an interrupt number and level/sense information. See the following example, which defines a single interrupt specifier, with an interrupt number of OxA and level/sense encoding of 8.',
		'```devicetree\ninterrupts = <0xA 8>;\n```',
	];
	return prop;
};
