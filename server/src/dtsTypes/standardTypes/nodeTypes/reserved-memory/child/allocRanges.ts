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
import { genStandardTypeDiagnostic } from '../../../../../helpers';
import { FileDiagnostic, StandardTypeIssue } from '../../../../../types';
import { BindingPropertyType } from '../../../../../types/index';
import { PropertyNodeType } from '../../../../types';
import { flatNumberValues, generateOrTypeObj } from '../../../helpers';

export default () => {
	const prop = new PropertyNodeType(
		'alloc-ranges',
		generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
		'optional',
		undefined,
		[],
		(property, macros) => {
			const issues: FileDiagnostic[] = [];

			const addressCells = property.parent.addressCells(macros);
			const sizeCells = property.parent.sizeCells(macros);
			const args = [
				...Array.from(
					{ length: addressCells },
					(_, i) => `address${addressCells > 1 ? i : ''}`,
				),
				...Array.from(
					{ length: sizeCells },
					(_, i) => `size${sizeCells > 1 ? i : ''}`,
				),
			];
			prop.signatureArgs = args.map((arg) =>
				ParameterInformation.create(arg),
			);
			prop.signatureArgsCyclic = true;

			const values = flatNumberValues(property.ast.values);
			if (!values) {
				return [];
			}

			if (
				values.length === 0 ||
				values.length % (addressCells + sizeCells) !== 0
			) {
				const issueAst =
					values.at(
						values.length -
							(values.length % (sizeCells + addressCells)),
					) ?? property.ast;

				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.CELL_MISS_MATCH,
						issueAst.firstToken,
						issueAst.lastToken,
						issueAst,
						{
							templateStrings: [
								property.name,
								`<${[
									...Array.from(
										{ length: addressCells },
										() => 'address',
									),
									...Array.from(
										{ length: sizeCells },
										() => 'size',
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
		`Specifies regions of memory that are acceptable to allocate from`,
	];

	return prop;
};
