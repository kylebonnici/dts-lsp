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

import { BindingPropertyType } from '../../types/index';
import { StandardTypeIssue } from '../../types';
import { genStandardTypeDiagnostic } from '../../helpers';
import { PropertyNodeType } from '../types';
import { generateOrTypeObj, getU32ValueFromProperty } from './helpers';

export default () => {
	const prop = new PropertyNodeType<number>(
		'phandle',
		generateOrTypeObj(BindingPropertyType.U32),
		'optional',
		undefined,
		undefined,
		(property, macros) => {
			const phandelValue = getU32ValueFromProperty(
				property,
				0,
				0,
				macros,
			);
			if (phandelValue) {
				const nodes = property.parent.root.getAllPhandle(phandelValue);
				if (nodes.length > 1 && nodes.at(-1) === property.parent) {
					const issueAst =
						property.ast.values?.values.at(0) ?? property.ast;
					return [
						genStandardTypeDiagnostic(
							StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE,
							issueAst.rangeTokens,
							issueAst,
							{
								linkedTo: nodes
									.slice(0, -1)
									.flatMap(
										(n) => n.getProperty('phandle')?.ast,
									)
									.filter((a) => !!a),
								templateStrings: [property.name],
							},
						),
					];
				}
			}
			return [];
		},
	);
	prop.description = [
		`The phandle property specifies a numerical identifier for a node that is unique within the devicetree. The phandle property value is used by other nodes that need to refer to the node associated with the property.`,
	];
	prop.examples = [
		'See the following devicetree excerpt:',
		[
			'```devicetree',
			`pic@10000000 {
\tphandle = <1>;
\tinterrupt-controller;
\treg = <0x10000000 0x100>;
};`,
			'```',
		].join('\n'),
		'A phandle value of 1 is defined. Another device node could reference the pic node with a phandle value of 1:',
		[
			'```devicetree',
			`another-device-node {
\tinterrupt-parent = <1>;
};`,
			'```',
		].join('\n'),
	];
	return prop;
};
