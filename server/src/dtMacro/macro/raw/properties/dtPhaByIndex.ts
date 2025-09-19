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

import { Expression } from '../../../../ast/cPreprocessors/expression';
import { ContextAware } from '../../../../runtimeEvaluator';
import { NodeType } from '../../../../dtsTypes/types';
import { Node } from '../../../../context/node';
import { toCIdentifier } from '../../../../dtMacro/helpers';

export async function dtPhaByIndexRaw(
	node: Node | undefined,
	propertyName: string,
	idx: number | string,
	cell: string,
	context: ContextAware,
): Promise<number | string | undefined> {
	const property = node?.properties.find(
		(p) => toCIdentifier(p.name) === propertyName,
	);

	const nodeType = property?.parent.nodeType;

	if (!nodeType || !(nodeType instanceof NodeType)) {
		return;
	}

	if (typeof idx === 'string') {
		const specifierSpace = property.nexusMapsTo.at(0)?.specifierSpace;
		const nameValues = specifierSpace
			? property.parent.getProperty(`${specifierSpace}-names`)?.ast
					.quickValues
			: undefined;

		idx =
			nameValues?.findIndex(
				(name) =>
					typeof name === 'string' && name.toLowerCase() === idx,
			) ?? -1;

		if (idx === -1) {
			return;
		}
	}

	const nexusMapping = property.nexusMapsTo.at(idx);
	const cellNames = nexusMapping?.target.nodeType?.cellsValues?.find(
		(c) =>
			nexusMapping.specifierSpace &&
			c.specifier === nexusMapping.specifierSpace,
	);
	const cellIndex = cellNames?.values?.indexOf(cell);

	if (cellIndex === undefined || cellIndex === -1) {
		return;
	}

	const value = nexusMapping?.mappingValuesAst.at(cellIndex);

	if (value instanceof Expression) {
		const v = value.evaluate(context.macros);
		if (typeof v !== 'number') {
			return value.toString();
		}
		return v;
	}
}
