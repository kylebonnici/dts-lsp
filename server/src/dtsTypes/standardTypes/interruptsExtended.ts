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
	DiagnosticSeverity,
	ParameterInformation,
} from 'vscode-languageserver';
import { NexuxMapping } from '../../context/property';
import { BindingPropertyType } from '../../types/index';
import { FileDiagnostic, StandardTypeIssue } from '../../types';
import { PropertyNodeType } from '../types';
import { genStandardTypeDiagnostic } from '../../helpers';
import { Expression } from '../../ast/cPreprocessors/expression';
import {
	flatNumberValues,
	generateOrTypeObj,
	getU32ValueFromProperty,
	resolvePhandleNode,
} from './helpers';

export default () => {
	const prop = new PropertyNodeType<number>(
		'interrupts-extended',
		generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
		'optional',
		undefined,
		undefined,
		(property, macros) => {
			const issues: FileDiagnostic[] = [];

			const node = property.parent;
			const interrupts = node.getProperty('interrupts');

			if (interrupts) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.IGNORED,
						interrupts.ast,
						DiagnosticSeverity.Warning,
						[property.ast],
						[],
						[
							interrupts.name,
							"is ignored when 'interrupts-extended' is used",
						],
					),
				);
			}

			const interruptParent = node.getProperty('interrupt-parent');
			if (interruptParent) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.IGNORED,
						interruptParent.ast,
						DiagnosticSeverity.Warning,
						[property.ast],
						[],
						[
							interruptParent.name,
							"is ignored when 'interrupts-extended' is used",
						],
					),
				);
			}

			const root = node.root;

			const values = flatNumberValues(property.ast.values);
			if (!values?.length) {
				return [];
			}

			let i = 0;
			let index = 0;
			const args: string[][] = [];
			while (i < values.length) {
				const phandleNode = resolvePhandleNode(values[i], root);

				if (!phandleNode) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
							values[i],
							DiagnosticSeverity.Error,
						),
					);
					return issues;
				}

				const cellsProperty =
					phandleNode.getProperty('#interrupt-cells');

				if (!cellsProperty) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
							property.ast,
							DiagnosticSeverity.Error,
							[...phandleNode.nodeNameOrLabelRef],
							[],
							[
								property.name,
								'#interrupt-cells',
								phandleNode.pathString,
							],
						),
					);

					break;
				}

				const cellsPropertyValue = getU32ValueFromProperty(
					cellsProperty,
					0,
					0,
					macros,
				);

				if (cellsPropertyValue == null) {
					return issues;
				}

				const remaining = values.length - i - 1;

				args.push([
					`${index}_phandel`,
					...Array.from(
						{ length: cellsPropertyValue },
						(_, j) =>
							`${index}_interrupt${cellsPropertyValue > 1 ? j : ''}`,
					),
				]);

				if (cellsPropertyValue > remaining) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.CELL_MISS_MATCH,
							values.at(-1)!,
							DiagnosticSeverity.Error,
							[],
							[],
							[property.name, `<${args.at(-1)!.join(' ')}>`],
						),
					);
					return issues;
				}

				const mappingValuesAst = values.slice(
					i + 1,
					i + 1 + cellsPropertyValue,
				);
				const mapProperty = phandleNode.getProperty(`interrupt-map`);
				const nexusMapping: NexuxMapping = {
					mappingValuesAst,
					target: phandleNode,
				};

				property.nexusMapsTo.push(nexusMapping);

				const startAddress = node
					.mappedReg(macros)
					?.at(0)?.startAddress;
				if (mapProperty && startAddress) {
					const match = phandleNode.getNexusMapEntyMatch(
						'interrupt',
						macros,
						mappingValuesAst,
						startAddress,
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
					phandleNode.interrupControlerMapping.push({
						expressions: mappingValuesAst,
						node,
						property,
					});
				}

				i += cellsPropertyValue + 1;
				index++;
			}

			args.push([`${index}_phandel`, `${index}_interrupt...`]);

			prop.signatureArgs = args.map((arg) =>
				arg.map((arg) => ParameterInformation.create(arg)),
			);

			return issues;
		},
	);
	prop.description = [
		'The interrupts-extended property lists the interrupts) generated by a device. interrupts-extended should be used instead of interrupts when a device is connected to multiple interrupt controllers as it encodes a parent phandle with each interrupt specifier.',
		'The interrupts and interrupts-extended properties are mutually exclusive. A device node should use one or the other, but not both. Using both is only permissible when required for compatibility with software that does not understand interrupts-extended. If both interrupts-extended and interrupts are present then interrupts-extended takes precedence.',
	];
	prop.examples = [
		'This example shows how a device with two interrupt outputs connected to two separate interrupt controllers would describe the connection using an interrupts-extended property. pic is an interrupt controller with an #interrupt-cells specifier of 2, while gic is an interrupt controller with an #interrupts-cells specifier of 1.',
		'```devicetree\ninterrupts-extended = <&pic OXA 8>, <&gic Oxda>;\n```',
	];
	return prop;
};
