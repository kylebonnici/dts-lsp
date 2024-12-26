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

import { LabelRef } from "../../ast/dtc/labelRef";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";
import { NodePathRef } from "../../ast/dtc/values/nodePath";
import { NumberValue } from "../../ast/dtc/values/number";
import { PropertyValue } from "../../ast/dtc/values/value";
import { Node } from "../../context/node";
import { Property } from "../../context/property";
import { PropertyType, TypeConfig } from "../types";

export const getU32ValueFromProperty = (
  property: Property,
  valueIndex: number,
  arrayValueIndex: number
) => {
  const value = property.ast.values?.values.at(valueIndex)?.value;

  if (value instanceof ArrayValues) {
    const labeledValue = value.values.at(arrayValueIndex);

    if (labeledValue?.value instanceof NumberValue) {
      return labeledValue.value.value;
    }
  }
};

export const getInterruptPhandleNode = (
  value: PropertyValue | undefined | null,
  root: Node,
  index = 0
) => {
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
};

export const getInterruptInfo = (
  node: Node
): {
  node: Node;
  value?: number;
  cellsProperty?: Property;
} => {
  const cellsProperty = node.getProperty("#interrupt-cells");
  const cellsValue = cellsProperty?.ast.values?.values.at(0)?.value;

  if (cellsValue instanceof ArrayValues) {
    const value = cellsValue.values.at(0)?.value;
    if (value instanceof NumberValue) {
      return {
        cellsProperty,
        node,
        value: value.value,
      };
    }
  }

  return { cellsProperty, node };
};

export const generateOrTypeObj = (
  type: PropertyType | PropertyType[]
): TypeConfig[] => {
  if (Array.isArray(type)) {
    return [{ types: type }];
  }

  return [{ types: [type] }];
};
