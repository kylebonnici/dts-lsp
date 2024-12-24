import { Issue, StandardTypeIssue } from "../../types";
import { genIssue } from "../../helpers";
import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj, getU32ValueFromProperty } from "./helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";

export default () =>
  new PropertyNodeType(
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

      const sizeCellProperty =
        property.parent.parent?.getProperty("#size-cells");
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
            StandardTypeIssue.CELL_MISS_MATCH,
            value,
            DiagnosticSeverity.Error,
            [],
            [],
            [
              property.name,
              `<${[
                ...Array.from({ length: addressCell }, () => "address"),
                ...Array.from({ length: sizeCell }, () => "cell"),
              ].join(" ")}>`,
            ]
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
