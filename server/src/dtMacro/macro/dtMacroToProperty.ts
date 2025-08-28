/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { Property } from '../../context/property';
import { ResolveMacroRequest, toCIdentifier } from '../helpers';
import { dtMacroToNode } from './dtMacroToNode';
import { dtPhandel } from './properties/dtPhandel';
import { dtPhandelByIndex } from './properties/dtPhandelByIndex';

const simplePropertyMacros = [
	'DT_PROP',
	'DT_PROP_LEN',
	'DT_PROP_LEN_OR',
	'DT_PROP_HAS_IDX',
	'DT_PROP_HAS_NAME',
	'DT_PROP_BY_IDX',
	'DT_PROP_LAST',
	'DT_PROP_OR',
	'DT_ENUM_IDX_BY_IDX',
	'DT_ENUM_IDX',
	'DT_ENUM_IDX_BY_IDX_OR',
	'DT_ENUM_IDX_OR',
	'DT_ENUM_HAS_VALUE_BY_IDX',
	'DT_ENUM_HAS_VALUE',
	'DT_STRING_TOKEN',
	'DT_STRING_TOKEN_OR',
	'DT_STRING_UPPER_TOKEN',
	'DT_STRING_UPPER_TOKEN_OR',
	'DT_STRING_UNQUOTED',
	'DT_STRING_UNQUOTED_OR',
	'DT_STRING_TOKEN_BY_IDX',
	'DT_STRING_UPPER_TOKEN_BY_IDX',
	'DT_STRING_UNQUOTED_BY_IDX',
	'DT_PROP_BY_PHANDLE_IDX',
	'DT_PROP_BY_PHANDLE_IDX_OR',
	'DT_PROP_BY_PHANDLE',
	'DT_PHA_BY_IDX',
	'DT_PHA_BY_IDX_OR',
	'DT_PHA',
	'DT_PHA_OR',
	'DT_PHA_BY_NAME',
	'DT_PHA_BY_NAME_OR',
	'DT_PHANDLE_BY_NAME',
	'DT_PHANDLE_BY_IDX',
	'DT_PHANDLE',
];

export async function dtMacroToProperty({
	macro,
	document,
	context,
	position,
}: ResolveMacroRequest): Promise<Property | undefined> {
	if (
		simplePropertyMacros.some((m) => m === macro.parent?.macro) &&
		macro.argIndexInParent === 1 &&
		macro.parent?.args?.[0]
	) {
		const node = await dtMacroToNode({
			document,
			context,
			position,
			macro: macro.parent.args[0],
		});

		return node?.property.find(
			(p) => toCIdentifier(p.name) === macro.macro,
		);
	}

	if (
		['DT_PROP_BY_PHANDLE'].some((m) => m === macro.parent?.macro) &&
		macro.argIndexInParent === 2 &&
		macro.parent?.args?.[0] &&
		macro.parent?.args?.[1]
	) {
		const node = await dtPhandel(
			{
				document,
				context,
				position,
				macro: {
					macro: 'DT_PHANDLE',
					args: macro.parent.args.slice(0, 2),
				},
			},
			dtMacroToNode,
		);

		return node?.property.find(
			(p) => toCIdentifier(p.name) === macro.macro,
		);
	}

	if (
		['DT_PROP_BY_PHANDLE_IDX', 'DT_PROP_BY_PHANDLE_IDX_OR'].some(
			(m) => m === macro.parent?.macro,
		) &&
		macro.argIndexInParent === 3 &&
		macro.parent?.args?.[0] &&
		macro.parent?.args?.[1] &&
		macro.parent?.args?.[3]
	) {
		const node = await dtPhandelByIndex(
			{
				document,
				context,
				position,
				macro: {
					macro: 'DT_PHANDLE_BY_IDX',
					args: macro.parent.args.slice(0, 3),
				},
			},
			dtMacroToNode,
		);

		return node?.property.find(
			(p) => toCIdentifier(p.name) === macro.macro,
		);
	}

	if (
		['DT_CHOSEN', 'DT_HAS_CHOSEN'].some((m) => m === macro.parent?.macro) &&
		macro.argIndexInParent === 0 &&
		macro.parent?.args?.[0]
	) {
		return (await context.getRuntime()).rootNode
			.getChild(['/', 'chosen'])
			?.property.find((p) => toCIdentifier(p.name) === macro.macro);
	}
}
