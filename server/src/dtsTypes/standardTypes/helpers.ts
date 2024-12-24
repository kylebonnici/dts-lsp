import { LabelRef } from "../../ast/dtc/labelRef";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";
import { NodePathRef } from "../../ast/dtc/values/nodePath";
import { NumberValue } from "../../ast/dtc/values/number";
import { PropertyValue } from "../../ast/dtc/values/value";
import { Node } from "../../context/node";
import { Property } from "../../context/property";
import { PropetyType, TypeConfig } from "../types";

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

export const getInterruptPhandelNode = (
  value: PropertyValue | undefined | null,
  root: Node,
  index = 0
) => {
  if (value?.value instanceof ArrayValues) {
    const linked = value.value.values.at(index);
    if (linked?.value instanceof NumberValue) {
      return root.getPhandel(linked.value.value);
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
  interruptControllerProperty?: Property;
} => {
  const cellsProperty = node.getProperty("#interrupt-cells");
  const interruptControllerProperty = node.getProperty("interrupt-controller");
  const cellsValue = cellsProperty?.ast.values?.values.at(0)?.value;

  if (cellsValue instanceof ArrayValues) {
    const value = cellsValue.values.at(0)?.value;
    if (value instanceof NumberValue) {
      return {
        cellsProperty,
        node,
        value: value.value,
        interruptControllerProperty,
      };
    }
  }

  return { cellsProperty, node };
};

export const generateOrTypeObj = (
  type: PropetyType | PropetyType[]
): TypeConfig[] => {
  if (Array.isArray(type)) {
    return [{ types: type }];
  }

  return [{ types: [type] }];
};
