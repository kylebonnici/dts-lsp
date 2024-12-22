import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { type Node } from "../context/node";
import { NodeType, PropertyNodeType, PropetyType, TypeConfig } from "./types";
import { StandardTypeIssue } from "../types";
import { NumberValue } from "../ast/dtc/values/number";
import { LabledValue } from "../ast/dtc/values/labledValue";
import { StringValue } from "../ast/dtc/values/string";

const generateOrTypeObj = (type: PropetyType | PropetyType[]): TypeConfig[] => {
  if (Array.isArray(type)) {
    return [{ types: type }];
  }

  return [{ types: [type] }];
};

const compatibleType = new PropertyNodeType(
  "compatible",
  generateOrTypeObj(PropetyType.STRINGLIST)
);
const modelType = new PropertyNodeType(
  "model",
  generateOrTypeObj(PropetyType.STRING)
);
const phandelType = new PropertyNodeType(
  "phandle",
  generateOrTypeObj(PropetyType.U32)
);
const statusType = new PropertyNodeType(
  "status",
  generateOrTypeObj(PropetyType.STRING),
  "optional",
  "okay",
  ["okay", "disabled", "reserved", "fail", "fail-sss"]
);
const addressCellsType = new PropertyNodeType(
  "#address-cells",
  generateOrTypeObj(PropetyType.U32),
  "optional",
  2
);

const sizeCellsType = new PropertyNodeType(
  "#size-cells",
  generateOrTypeObj(PropetyType.U32),
  "optional",
  1
);

const regType = new PropertyNodeType(
  "reg",
  generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
  (node) => {
    return node.address ? "required" : "ommited";
  },
  undefined,
  [],
  (property) => {
    const issues: StandardTypeIssue[] = [];
    const value = property.ast.values?.values.at(0)?.value;
    if (!(value instanceof ArrayValues)) {
      return [];
    }

    let shouldHavePair = true;

    const parentSizeCells = property.parent.parent
      ?.getProperty("#size-cells")
      ?.ast.values?.values.at(0)?.value;

    if (parentSizeCells instanceof ArrayValues) {
      const labeledValue = parentSizeCells.values.at(0);

      if (
        labeledValue instanceof LabledValue &&
        labeledValue.value instanceof NumberValue
      ) {
        shouldHavePair = 0 !== labeledValue.value.value;
      }
    }

    if (shouldHavePair && value.values.length % 2 !== 0)
      issues.push(StandardTypeIssue.EXPECTED_PAIR);

    const numberValue = value.values.at(0);
    if (
      numberValue instanceof LabledValue &&
      numberValue.value instanceof NumberValue &&
      numberValue.value.value !== property.parent.address
    ) {
      issues.push(StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE);
    }

    return issues;
  }
);
const virtualRegType = new PropertyNodeType(
  "virtual-reg",
  generateOrTypeObj(PropetyType.U32)
);
const rangesType = new PropertyNodeType(
  "ranges",
  generateOrTypeObj([PropetyType.EMPTY, PropetyType.PROP_ENCODED_ARRAY]),
  "optional",
  undefined,
  [],
  (property) => {
    const value = property.ast.values?.values.at(0)?.value;
    if (!(value instanceof ArrayValues)) {
      return [];
    }

    return value.values.length % 3 === 0
      ? []
      : [StandardTypeIssue.EXPECTED_TRIPLETS];
  }
);

const dmaRangesType = new PropertyNodeType(
  "dma-ranges",
  generateOrTypeObj([PropetyType.EMPTY, PropetyType.PROP_ENCODED_ARRAY]),
  "optional",
  undefined,
  [],
  (property) => {
    const value = property.ast.values?.values.at(0)?.value;
    if (!(value instanceof ArrayValues)) {
      return [];
    }

    return value.values.length % 3 === 0
      ? []
      : [StandardTypeIssue.EXPECTED_TRIPLETS];
  }
);

const dmaCoherentType = new PropertyNodeType(
  "dma-coherent",
  generateOrTypeObj(PropetyType.EMPTY)
);

const dmaNoncoherentType = new PropertyNodeType(
  "dma-noncoherent",
  generateOrTypeObj(PropetyType.EMPTY)
);

const deviceTypeType = new PropertyNodeType(
  "device_type",
  generateOrTypeObj(PropetyType.STRING),
  (node) => {
    return node.name === "cpu" || node.name === "memory"
      ? "required"
      : "ommited";
  },
  undefined,
  (property) => {
    if (property.parent.name === "cpu" || property.parent.name === "memory") {
      return [property.parent.name];
    }
    return [];
  },
  (property) => {
    if (property.parent.name === "cpu" || property.parent.name === "memory") {
      const value = property.ast.values?.values.at(0)?.value;
      if (
        value instanceof StringValue &&
        value.value.slice(1, -1) !== property.parent.name
      ) {
        return property.parent.name === "cpu"
          ? [StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU]
          : [StandardTypeIssue.EXPECTED_DEVICE_TYPE_MEMORY];
      }
    }
    return [];
  }
);

const nameType = new PropertyNodeType(
  "name",
  generateOrTypeObj(PropetyType.STRING)
);

export function getStandardType(node: Node) {
  const standardType = new NodeType(node);
  standardType.properties.push(
    compatibleType,
    modelType,
    phandelType,
    statusType,
    addressCellsType,
    sizeCellsType,
    regType,
    virtualRegType,
    rangesType,
    dmaRangesType,
    dmaCoherentType,
    dmaNoncoherentType,
    nameType,
    deviceTypeType
  );
  return standardType;
}
