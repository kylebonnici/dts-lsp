import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { type Node } from "../context/node";
import { NodeType, PropertyNodeType, PropetyType, TypeConfig } from "./types";
import { StandardTypeIssue } from "../types";

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
  false,
  "okay",
  ["okay", "disabled", "reserved", "fail", "fail-sss"]
);
const addressCellsType = new PropertyNodeType(
  "#address-cells",
  generateOrTypeObj(PropetyType.U32),
  false,
  2
);

const sizeCellsType = new PropertyNodeType(
  "#size-cells",
  generateOrTypeObj(PropetyType.U32),
  false,
  1
);

const regType = new PropertyNodeType("reg", [
  {
    types: [PropetyType.PROP_ENCODED_ARRAY],
  },
]);
const virtualRegType = new PropertyNodeType(
  "virtual-reg",
  generateOrTypeObj(PropetyType.U32)
);
const rangesType = new PropertyNodeType(
  "ranges",
  generateOrTypeObj([PropetyType.EMPTY, PropetyType.PROP_ENCODED_ARRAY]),
  false,
  undefined,
  [],
  (values) => {
    const value = values.values.at(0)?.value;
    if (!(value instanceof ArrayValues)) {
      return [];
    }

    return value.values.length % 3 === 0
      ? []
      : [StandardTypeIssue.EXPECTED_TRIPLETS];
  }
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
    rangesType
  );
  return standardType;
}
