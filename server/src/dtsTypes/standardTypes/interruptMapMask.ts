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

import { ParameterInformation } from 'vscode-languageserver-types';
import { FileDiagnostic, StandardTypeIssue } from '../../types';
import { BindingPropertyType } from '../../types/index';
import { PropertyNodeType } from '../types';
import { genStandardTypeDiagnostic } from '../../helpers';
import {
	flatNumberValues,
	generateOrTypeObj,
	getU32ValueFromProperty,
} from './helpers';

export default () => {
	const prop = new PropertyNodeType<number>(
		'interrupt-map-mask',
		generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
		'optional',
		undefined,
		undefined,
		(property, macros) => {
			const issues: FileDiagnostic[] = [];
			const node = property.parent;

			const values = flatNumberValues(property.ast.values);
			if (!values?.length) {
				return [];
			}

			const childInterruptSpecifier =
				node.getProperty('#interrupt-cells');

			if (!childInterruptSpecifier) {
				return issues;
			}

			const childAddressCellsValue = node.addressCells(macros);

			const childInterruptSpecifierValue = getU32ValueFromProperty(
				childInterruptSpecifier,
				0,
				0,
				macros,
			);

			if (childInterruptSpecifierValue == null) {
				return issues;
			}

			const args = [
				...Array.from(
					{ length: childAddressCellsValue },
					(_, i) =>
						`AddressMask${childAddressCellsValue > 1 ? i : ''}`,
				),
				...Array.from(
					{ length: childInterruptSpecifierValue },
					(_, i) =>
						`InterruptMask${childInterruptSpecifierValue > 1 ? i : ''}`,
				),
			];
			prop.signatureArgs = args.map((arg) =>
				ParameterInformation.create(arg),
			);

			if (
				values.length !==
				childAddressCellsValue + childInterruptSpecifierValue
			) {
				const issueAST = property.ast.values ?? property.ast;
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.CELL_MISS_MATCH,
						issueAST.rangeTokens,
						issueAST,
						{
							templateStrings: [
								property.name,
								`<${[
									...Array.from(
										{ length: childAddressCellsValue },
										() => 'AddressMask',
									),
									...Array.from(
										{
											length: childInterruptSpecifierValue,
										},
										() => 'InterruptMask',
									),
								].join(' ')}>`,
							],
						},
					),
				);
				return issues;
			}

			return issues;
		},
	);
	prop.description = [
		'An interrupt-map-mask property is specified for a nexus node in the interrupt tree. This property specifies a mask that is ANDed with the incoming unit interrupt specifier being looked up in the table specified in the interrupt-mapproperty.',
	];

	return prop;
};
