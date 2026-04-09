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

import { PropertyNodeType } from '../../../../types';
import { generateOrTypeObj } from '../../../helpers';

export default () => {
	const prop = new PropertyNodeType(
		'clock-frequency',
		generateOrTypeObj(['U32', 'U64']),
	);
	prop.description = [
		`Specifies the current clock speed of the CPU in Hertz. The value is a <prop-encoded-array> in one of two forms:
- A 32-bit integer consisting of one <u32> specifying the frequency.
- A 64-bit integer represented as a <u64> specifying the frequency.`,
	];
	return prop;
};
