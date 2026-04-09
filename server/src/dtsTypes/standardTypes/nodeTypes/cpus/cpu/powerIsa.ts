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

import { genStandardTypeDiagnostic } from '../../../../../helpers';
import { PropertyNodeType } from '../../../../types';
import { generateOrTypeObj } from '../../../helpers';
import { StandardTypeIssue } from '../../../../../types';

export default () => {
	const prop = new PropertyNodeType(
		/power-isa-*/,
		generateOrTypeObj('EMPTY'),
		'optional',
		undefined,
		[],
		(property) => {
			const node = property.parent;
			if (
				node.getProperty('power-isa-version') ||
				(node.parent?.name === 'cpus' &&
					node.parent?.getProperty('power-isa-version'))
			) {
				return [];
			}
			return [
				genStandardTypeDiagnostic(
					StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
					property.ast.values?.firstToken ?? property.ast.firstToken,
					property.ast.values?.lastToken ?? property.ast.lastToken,
					property.ast,
					{
						linkedTo: [...node.nodeNameOrLabelRef],
						templateStrings: [
							property.name,
							`power-isa-version`,
							node.pathString,
						],
					},
				),
			];
		},
	);
	prop.description = [
		`If the power-isa-version property exists, then for each category from the Categories section of Book I of the Power ISA version indicated, the existence of a property named power-isa-[CAT], where [CAT] is the abbreviated category name with all uppercase letters converted to lowercase, indicates that the category is supported by the implementation.`,
		`For example, if the power-isa-version property exists and its value is "2.06" and the power-isa-e.hv property exists, then the implementation supports [Category:Embedded.Hypervisor] as defined in Power ISA Version 2.06.`,
	];
	return prop;
};
