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
import { BindingPropertyType } from '../../types/index';
import { FileDiagnostic, StandardTypeIssue } from '../../types';
import {
	compareWords,
	createTokenIndex,
	genStandardTypeDiagnostic,
} from '../../helpers';
import { PropertyNodeType } from '../types';
import { ASTBase } from '../../ast/base';
import { ArrayValues } from '../../ast/dtc/values/arrayValue';
import {
	flatNumberValues,
	generateOrTypeObj,
	getU32ValueFromProperty,
} from './helpers';

export default () => {
	const prop = new PropertyNodeType<number>(
		'reg',
		generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
		(node) => {
			return node.address !== undefined ? 'required' : 'omitted';
		},
		undefined,
		undefined,
		(property, macros) => {
			const issues: FileDiagnostic[] = [];

			const values = flatNumberValues(property.ast.values);
			if (!values) {
				return [];
			}

			const parentSizeCell = property.parent.parentSizeCells(macros);
			const parentAddressCell =
				property.parent.parentAddressCells(macros);

			const args = [
				...Array.from(
					{ length: parentAddressCell },
					(_, i) => `address${parentAddressCell > 1 ? i : ''}`,
				),
				...Array.from(
					{ length: parentSizeCell },
					(_, i) => `size${parentSizeCell > 1 ? i : ''}`,
				),
			];
			prop.signatureArgs = args.map((arg) =>
				ParameterInformation.create(arg),
			);
			prop.signatureArgsCyclic = true;

			if (
				values.length === 0 ||
				values.length % (parentSizeCell + parentAddressCell) !== 0
			) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.CELL_MISS_MATCH,
						values.at(
							values.length -
								(values.length %
									(parentSizeCell + parentAddressCell)),
						) ?? property.ast,
						DiagnosticSeverity.Error,
						[],
						[],
						[
							property.name,
							`<${[
								...Array.from(
									{ length: parentAddressCell },
									() => 'address',
								),
								...Array.from(
									{ length: parentSizeCell },
									() => 'size',
								),
							].join(' ')}>`,
						],
					),
				);
				return issues;
			}

			const refAddress = values
				.slice(0, parentAddressCell)
				.map(
					(_, i) =>
						getU32ValueFromProperty(property, 0, i, macros) ?? 0,
				);

			if (
				property.parent.address &&
				compareWords(property.parent.address, refAddress) !== 0
			) {
				const startValue = (
					property.ast.values?.values.at(0)?.value as
						| ArrayValues
						| undefined
				)?.values?.at(0);
				const endValue = (
					property.ast.values?.values.at(0)?.value as
						| ArrayValues
						| undefined
				)?.values?.at(parentAddressCell - 1);
				const addressValues =
					startValue && endValue
						? new ASTBase(
								createTokenIndex(
									startValue.firstToken,
									endValue.lastToken,
								),
							)
						: undefined;
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_ADDRESS_VALUE,
						addressValues ?? property.ast.values ?? property.ast,
						DiagnosticSeverity.Error,
						[],
						[],
						[property.name],
					),
				);
			}

			return issues;
		},
	);
	prop.examples = [
		'Suppose a device within a system-on-a-chip had two blocks of registers, a 32-byte block at offset 0x3000 in the SOC and a 256-byte block at offset OxFE00. The reg property would be encoded as follows (assuming #address-cells and #size-cells values of 1):',
		'```devicetree\nreg = <0x3000 0x20 0xFE00 0x100>;\n```',
	];
	return prop;
};
