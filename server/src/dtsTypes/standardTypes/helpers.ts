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

import { PropertyValues } from '../../ast/dtc/values/values';
import { LabelRef } from '../../ast/dtc/labelRef';
import { ArrayValues } from '../../ast/dtc/values/arrayValue';
import { NodePathRef } from '../../ast/dtc/values/nodePath';
import { NumberValue } from '../../ast/dtc/values/number';
import { PropertyValue } from '../../ast/dtc/values/value';
import { Node } from '../../context/node';
import { Property } from '../../context/property';
import { Expression } from '../../ast/cPreprocessors/expression';
import { BindingPropertyType, TypeConfig } from '../../types/index';
import { MacroRegistryItem } from '../../types';

export const flatNumberValues = (value: PropertyValues | null | undefined) => {
	if (value?.values.some((v) => !(v?.value instanceof ArrayValues))) {
		return undefined;
	}

	return (
		(value?.values.flatMap((v) =>
			(v!.value as ArrayValues).values.map((vv) => vv.value),
		) as (LabelRef | NodePathRef | NumberValue | Expression)[]) ?? []
	);
};

export const getU32ValueFromFlatProperty = (
	property: Property,
	arrayValueIndex: number,
	macros: Map<string, MacroRegistryItem>,
) => {
	const value = flatNumberValues(property.ast.values)?.at(arrayValueIndex);

	if (value instanceof ArrayValues) {
		const labeledValue = value.values.at(arrayValueIndex);

		if (labeledValue?.value instanceof Expression) {
			const evaluted = labeledValue.value.evaluate(macros);
			if (typeof evaluted === 'number') return evaluted;
		}
	}
};

export const getU32ValueFromProperty = (
	property: Property,
	valueIndex: number,
	arrayValueIndex: number,
	macros: Map<string, MacroRegistryItem>,
) => {
	const value = property.ast.values?.values.at(valueIndex)?.value;

	if (value instanceof ArrayValues) {
		const labeledValue = value.values.at(arrayValueIndex);

		if (labeledValue?.value instanceof Expression) {
			const evaluted = labeledValue.value.evaluate(macros);
			if (typeof evaluted === 'number') return evaluted;
		}
	}
};

export const resolvePhandleNode = (
	value:
		| (PropertyValue | (LabelRef | NodePathRef | NumberValue | Expression))
		| undefined
		| null,
	root: Node,
	index = 0,
) => {
	if (value instanceof PropertyValue) {
		if (value?.value instanceof ArrayValues) {
			const linked = value.value.values.at(index);
			if (linked?.value instanceof NumberValue) {
				return root.getPhandle(linked.value.value);
			}
			if (linked?.value instanceof LabelRef) {
				return linked.value.linksTo;
			}

			if (linked?.value instanceof NodePathRef) {
				return linked.value.path?.pathParts.at(-1)?.linksTo;
			}
		}
	} else {
		if (value instanceof NumberValue) {
			return root.getPhandle(value.value);
		}
		if (value instanceof LabelRef) {
			return value.linksTo;
		}

		if (value instanceof NodePathRef) {
			return value.path?.pathParts.at(-1)?.linksTo;
		}
	}
};

export const generateOrTypeObj = (
	type: BindingPropertyType | BindingPropertyType[],
): TypeConfig[] => {
	if (Array.isArray(type)) {
		return [{ types: type }];
	}

	return [{ types: [type] }];
};
