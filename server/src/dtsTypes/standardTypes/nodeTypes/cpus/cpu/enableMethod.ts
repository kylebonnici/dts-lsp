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

import { FileDiagnostic, StandardTypeIssue } from '../../../../../types';
import { PropertyNodeType } from '../../../../types';
import { generateOrTypeObj } from '../../../helpers';
import { genStandardTypeDiagnostic } from '../../../../../helpers';
import { StringValue } from '../../../../../ast/dtc/values/string';

export default () => {
	const prop = new PropertyNodeType(
		'enable-method',
		generateOrTypeObj('STRINGLIST'),
		'optional',
		undefined,
		[],
		(property) => {
			const issues: FileDiagnostic[] = [];
			const v = property.ast.quickValues;

			if (v && v.length > 1 && v.some((vv) => vv === 'spin-table')) {
				issues.push(
					genStandardTypeDiagnostic(
						StandardTypeIssue.SPIN_TABLE_ENABLE_METHOD,
						property.ast.values?.firstToken ??
							property.ast.firstToken,
						property.ast.values?.lastToken ??
							property.ast.lastToken,
						property.ast,
					),
				);
			}

			property.ast.getFlatAstValues()?.forEach((v) => {
				if (
					v instanceof StringValue &&
					!/^\w+,\w+$/.test(v.value) &&
					v.value !== 'spin-table'
				) {
					issues.push(
						genStandardTypeDiagnostic(
							StandardTypeIssue.VENDOR_METHOD_FORMAT,
							v.firstToken,
							v.lastToken,
							v,
						),
					);
				}
			});

			return issues;
		},
	);
	prop.description = [
		`Describes the method by which a CPU in a disabled state is enabled. This property is required for CPUs with a status property with a value of "disabled". The value consists of one or more strings that define the method to release this CPU. If a client program recognizes any of the methods, it may use it. The value shall be one of the following:`,
		`"spin-table" :
	The CPU is enabled with the spin table method defined in the DTSpec.`,
		`"[vendor],[method]" :
	Implementation dependent string that describes the method by which a CPU is released from a "disabled" state. The required format is: "[vendor],[method]", where vendor is a string describing the name of the manufacturer and method is a string describing the vendor specific mechanism.`,
		`Example: "fsl,MPC8572DS"`,
	];
	return prop;
};
