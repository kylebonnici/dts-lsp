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

import { getStandardDefaultType } from '../../../../standardDefaultType';
import alignment from './alignment';
import allocRanges from './allocRanges';
import noMap from './noMap';
import reusable from './reusable';
import size from './size';

export function getReservedMemoryChildNodeType() {
	const nodeType = getStandardDefaultType();

	const regProp = nodeType.properties.find((p) => p.name === 'reg');
	regProp!.required = () => {
		return 'optional';
	};

	nodeType.addProperty([
		size(),
		alignment(),
		allocRanges(),
		noMap(),
		reusable(),
	]);

	return nodeType;
}
