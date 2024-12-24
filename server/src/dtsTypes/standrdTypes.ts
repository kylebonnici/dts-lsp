import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { type Node } from "../context/node";
import { NodeType, PropertyNodeType, PropetyType, TypeConfig } from "./types";
import { Issue, StandardTypeIssue } from "../types";
import { NumberValue } from "../ast/dtc/values/number";
import { StringValue } from "../ast/dtc/values/string";
import { genIssue } from "../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { LabelRef } from "../ast/dtc/labelRef";
import { NodePathRef } from "../ast/dtc/values/nodePath";
import { Property } from "../context/property";
import { PropertyValue } from "src/ast/dtc/values/value";
import { ASTBase } from "src/ast/base";

const getU32ValueFromProperty = (
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

const getInterruptPhandelNode = (
  value: PropertyValue | undefined | null,
  root: Node
) => {
  if (value?.value instanceof ArrayValues) {
    const linked = value.value.values.at(0);
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
const getInterruptInfo = (
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
  generateOrTypeObj(PropetyType.U32),
  "optional",
  undefined,
  [],
  (property) => {
    const phandelValue = getU32ValueFromProperty(property, 0, 0);
    if (phandelValue) {
      const nodes = property.parent.root.getAllPhandel(phandelValue);
      if (nodes.length > 1 && nodes.at(-1) === property.parent) {
        return [
          genIssue(
            StandardTypeIssue.EXPECTED_UNIQUE_PHANDEL,
            property.ast.values?.values.at(0) ?? property.ast,
            DiagnosticSeverity.Error,
            nodes
              .slice(0, -1)
              .flatMap((n) => n.getProperty("phandle")?.ast)
              .filter((a) => !!a) as ASTBase[],
            [],
            [property.name]
          ),
        ];
      }
    }
    return [];
  }
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
    return node.address !== undefined ? "required" : "ommited";
  },
  undefined,
  [],
  (property) => {
    const issues: Issue<StandardTypeIssue>[] = [];
    const value = property.ast.values?.values.at(0)?.value;
    if (!(value instanceof ArrayValues)) {
      return [];
    }

    const sizeCellProperty = property.parent.parent?.getProperty("#size-cells");
    const addressCellProperty =
      property.parent.parent?.getProperty("#address-cells");

    const sizeCell = sizeCellProperty
      ? getU32ValueFromProperty(sizeCellProperty, 0, 0) ?? 1
      : 1;
    const addressCell = addressCellProperty
      ? getU32ValueFromProperty(addressCellProperty, 0, 0) ?? 2
      : 2;

    if (value.values.length % (sizeCell + addressCell) !== 0) {
      issues.push(
        genIssue(
          StandardTypeIssue.REG_CELL_MISSMATCH,
          value,
          DiagnosticSeverity.Error,
          [],
          [],
          [property.name, addressCell.toString(), sizeCell.toString()]
        )
      );
      return issues;
    }

    const numberValues = value.values
      .slice(0, addressCell)
      .map((_, i) => getU32ValueFromProperty(property, 0, i) ?? 0)
      .reverse()
      .reduce((p, c, i) => p + (c << (32 * i)), 0);

    if (numberValues !== property.parent.address) {
      issues.push(
        genIssue(
          StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
          property.ast,
          DiagnosticSeverity.Error,
          [],
          [],
          [property.name]
        )
      );
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
      : [
          genIssue(
            StandardTypeIssue.EXPECTED_TRIPLETS,
            property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name]
          ),
        ];
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
      : [
          genIssue(
            StandardTypeIssue.EXPECTED_TRIPLETS,
            property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [property.name]
          ),
        ];
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
          ? [
              genIssue(
                StandardTypeIssue.EXPECTED_DEVICE_TYPE_CPU,
                property.ast,
                DiagnosticSeverity.Error,
                [],
                [],
                [property.name]
              ),
            ]
          : [
              genIssue(
                StandardTypeIssue.EXPECTED_DEVICE_TYPE_MEMORY,
                property.ast,
                DiagnosticSeverity.Error,
                [],
                [],
                [property.name]
              ),
            ];
      }
    }
    return [];
  }
);

const nameType = new PropertyNodeType(
  "name",
  generateOrTypeObj(PropetyType.STRING),
  "optional",
  undefined,
  [],
  (property) => [
    genIssue(
      StandardTypeIssue.DEPRICATED,
      property.ast,
      DiagnosticSeverity.Warning,
      [],
      [],
      [property.name]
    ),
  ]
);
nameType.hideAutoComplete = true;

const interruptsType = new PropertyNodeType(
  "interrupts",
  generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
  "optional",
  undefined,
  [],
  (property) => {
    const issues: Issue<StandardTypeIssue>[] = [];

    const node = property.parent;
    const interruptParent = node.getProperty("interrupt-parent");
    const root = node.root;
    const parentInterruptNode = interruptParent
      ? getInterruptPhandelNode(interruptParent?.ast.values?.values.at(0), root)
      : node.parent;

    if (!parentInterruptNode) {
      if (!interruptParent) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...property.parent.definitons],
            [],
            [
              property.name,
              "interrupt-parent",
              `/${property.parent.path.slice(1).join("/")}`,
            ]
          )
        );
        return issues;
      } else {
        issues.push(
          genIssue(
            StandardTypeIssue.INTERUPTS_PARENT_NODE_NOT_FOUND,
            interruptParent.ast.values?.values.at(0)?.value ??
              interruptParent.ast
          )
        );
        return issues;
      }
    }

    const interruptCell = getInterruptInfo(parentInterruptNode);

    if (!interruptCell.interruptControllerProperty) {
      issues.push(
        genIssue(
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
          property.ast,
          DiagnosticSeverity.Error,
          [...parentInterruptNode.definitons],
          [],
          [
            property.name,
            "interrupt-controller",
            `/${parentInterruptNode.path.slice(1).join("/")}`,
          ]
        )
      );
    }

    if (!interruptCell.cellsProperty) {
      issues.push(
        genIssue(
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
          property.ast,
          DiagnosticSeverity.Error,
          [...parentInterruptNode.definitons],
          [],
          [
            property.name,
            "#interrupt-cells",
            `/${parentInterruptNode.path.slice(1).join("/")}`,
          ]
        )
      );
      return issues;
    }

    const interruptValue = property.ast.values?.values.at(0)?.value;
    if (interruptValue instanceof ArrayValues) {
      if (interruptCell.node) {
        if (
          interruptCell.value != null &&
          interruptCell.value !== interruptValue.values.length
        ) {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERUPTS_VALUE_CELL_MISS_MATCH,
              interruptValue,
              DiagnosticSeverity.Error,
              [interruptCell.cellsProperty.ast],
              [],
              [property.name, interruptCell.value.toString()]
            )
          );
        }
      }
    }

    return issues;
  }
);

const interruptParentType = new PropertyNodeType(
  "interrupt-parent",
  generateOrTypeObj(PropetyType.U32),
  "optional",
  undefined,
  [],
  (property) => {
    const issues: Issue<StandardTypeIssue>[] = [];

    const node = property.parent;
    const interrupt = node.getProperty("interrupts");

    if (!interrupt) {
      issues.push(
        genIssue(
          StandardTypeIssue.IGNORED,
          property.ast,
          DiagnosticSeverity.Warning,
          [],
          [],
          [property.name, "is ignored due to missing 'interrupt' property"]
        )
      );
    }
    return issues;
  }
);

const interruptsExtendedType = new PropertyNodeType(
  "interrupts-extended",
  generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
  "optional",
  undefined,
  [],
  (property) => {
    const issues: Issue<StandardTypeIssue>[] = [];

    const node = property.parent;
    const interrupts = node.getProperty("interrupts");

    if (interrupts) {
      issues.push(
        genIssue(
          StandardTypeIssue.IGNORED,
          interrupts.ast,
          DiagnosticSeverity.Warning,
          [property.ast],
          [],
          [interrupts.name, "is ignored when 'interrupts-extended' is used"]
        )
      );
    }

    const interruptParent = node.getProperty("interrupt-parent");
    if (interruptParent) {
      issues.push(
        genIssue(
          StandardTypeIssue.IGNORED,
          interruptParent.ast,
          DiagnosticSeverity.Warning,
          [property.ast],
          [],
          [
            interruptParent.name,
            "is ignored when 'interrupts-extended' is used ",
          ]
        )
      );
    }

    const extendedValues = property.ast.values;
    const root = node.root;
    const phandleNodes =
      extendedValues?.values.map((value) =>
        getInterruptPhandelNode(value, root)
      ) ?? [];

    const interruptCells = phandleNodes.map((n) =>
      n ? getInterruptInfo(n) : undefined
    );

    interruptCells.forEach((data, index) => {
      const extendedValue = property.ast.values?.values.at(index)?.value;
      if (!(extendedValue instanceof ArrayValues)) {
        return;
      }

      if (!data) {
        issues.push(
          genIssue(
            StandardTypeIssue.INTERUPTS_PARENT_NODE_NOT_FOUND,
            extendedValue.values.at(0) ?? extendedValue,
            DiagnosticSeverity.Error
          )
        );
        return issues;
      }

      if (!data.interruptControllerProperty) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...data.node.definitons],
            [],
            [
              property.name,
              "interrupt-controller",
              `/${data.node.path.slice(1).join("/")}`,
            ]
          )
        );
      }

      if (!data.cellsProperty) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...data.node.definitons],
            [],
            [
              property.name,
              "#interrupt-cells",
              `/${data.node.path.slice(1).join("/")}`,
            ]
          )
        );
        return;
      }

      if (
        data.value != null &&
        data.value !== extendedValue.values.length - 1
      ) {
        issues.push(
          genIssue(
            StandardTypeIssue.INTERUPTS_VALUE_CELL_MISS_MATCH,
            extendedValue,
            DiagnosticSeverity.Error,
            [data.cellsProperty.ast],
            [],
            [property.name, data.value.toString()]
          )
        );
        return;
      }
    });

    return issues;
  }
);
interruptsExtendedType.list = true;

const interruptCellsType = new PropertyNodeType(
  "#interrupt-cells",
  generateOrTypeObj(PropetyType.U32)
);

const interruptControllerType = new PropertyNodeType(
  "interrupt-controller",
  generateOrTypeObj(PropetyType.EMPTY),
  "optional"
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
    deviceTypeType,
    interruptsType,
    interruptParentType,
    interruptsExtendedType,
    interruptCellsType,
    interruptControllerType
  );
  return standardType;
}
