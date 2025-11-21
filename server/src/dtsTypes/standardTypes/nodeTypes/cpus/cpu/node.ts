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
import { StandardTypeIssue } from '../../../../../types';
import { getStandardDefaultType } from '../../../../../dtsTypes/standardDefaultType';

export function getCpuNodeType() {
	const nodeType = getStandardDefaultType();
	nodeType.additionalValidations = (_, node) => {
		if (node.parent?.name !== 'cpus') {
			const definition = node.implementations[0];

			return [
				genStandardTypeDiagnostic(
					StandardTypeIssue.NODE_LOCATION,
					definition.firstToken,
					definition.lastToken,
					definition,
					{
						linkedTo: node.implementations.slice(1),
						templateStrings: [
							'`cpu` node can only be a child of `cpus` node',
						],
					},
				),
			];
		}
		return [];
	};

	const regProp = nodeType.properties.find((p) => p.name === 'reg');
	regProp!.required = () => 'required';
	regProp!.description = [
		`The value of reg is a ‹prop-encoded-array> that defines a unique CPU/thread id for the
CP U/threads represented by the CPU node.
If a CPU supports more than one thread (i.e. multiple streams of execution) the reg property is an array with 1 element per thread.
The #address-cells on the /cpus node specifies how many cells each element of the array takes. Software can determine the number of threads by dividing the size of reg by the parent node's #address-cells.
If a CPU/thread can be the target of an external interrupt the reg property value must be a unique CPU/thread id that is addressable by the interrupt controller.
If a CPU/thread cannot be the target of an external interrupt, then reg must be unique and out of bounds of the range addressed by the interrupt controller
If a CPU/thread's PIR (pending interrupt reg-ister) is modifiable, a client program should modify PIR to match the reg property value.
If PIR cannot be modified and the PIR value is distinct from the interrupt controller number space, the CPUs binding may define a binding-specific representation of PIR values if desired.`,
	];

	return nodeType;
}
