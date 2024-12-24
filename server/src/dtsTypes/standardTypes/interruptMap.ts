import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropetyType } from "../types";
import {
  generateOrTypeObj,
  getInterruptPhandelNode,
  getU32ValueFromProperty,
} from "./helpers";
import { createTokenIndex, genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ArrayValues } from "../../ast/dtc/values/arrayValue";
import { ASTBase } from "../../ast/base";

export default () =>
  new PropertyNodeType(
    "interrupt-map",
    generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];
      const node = property.parent;
      const root = property.parent.root;
      const childAddressCells = node.getProperty("#address-cells");
      const childInteruptSpecifier = node.getProperty("#interrupt-cells");

      const values = property.ast.values?.values.at(0);

      if (!values) {
        return [];
      }

      if (!childAddressCells) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...node.definitons],
            [],
            [
              property.name,
              "#address-cells",
              `/${node.path.slice(1).join("/")}`,
            ]
          )
        );
      }

      if (!childInteruptSpecifier) {
        issues.push(
          genIssue(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...node.definitons],
            [],
            [
              property.name,
              "#interrupt-cells",
              `/${node.path.slice(1).join("/")}`,
            ]
          )
        );
      }

      if (issues.length) {
        return issues;
      }

      const childAddressCellsValue = getU32ValueFromProperty(
        childAddressCells!,
        0,
        0
      );

      const childInteruptSpecifierValue = getU32ValueFromProperty(
        childInteruptSpecifier!,
        0,
        0
      );

      if (
        childAddressCellsValue == null ||
        childInteruptSpecifierValue == null
      ) {
        return issues;
      }

      if (!(values.value instanceof ArrayValues)) {
        return issues;
      }

      let entryStartIndex = 0;
      let entryEndIndex = 0;
      let i = 0;
      while (i < values.value.values.length) {
        entryStartIndex = i;
        i += childAddressCellsValue + childInteruptSpecifierValue;

        if (values.value.values.length < i + 1) {
          const expLen =
            childAddressCellsValue + childInteruptSpecifierValue + 1;
          issues.push(
            genIssue(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values.value.values[values.value.values.length - 1],
              DiagnosticSeverity.Error,
              [],
              [],
              [
                property.name,
                `after the last value of ${[
                  ...Array.from(
                    { length: childAddressCellsValue },
                    () => "ChildAddress"
                  ),
                  ...Array.from(
                    { length: childInteruptSpecifierValue },
                    () => "ChildInterruptSpecifier"
                  ),
                  "InterruptParent ParentUnitAddress... ParentInterruptSpecifier...",
                ]
                  .slice(
                    (values.value.values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.value.values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        const interruptParent = getInterruptPhandelNode(values, root, i);
        if (!interruptParent) {
          issues.push(
            genIssue(
              StandardTypeIssue.INTERUPTS_PARENT_NODE_NOT_FOUND,
              values.value.values[i],
              DiagnosticSeverity.Error
            )
          );
          break;
        }

        const parentUnitAddress = interruptParent.getProperty("#address-cells");
        const parentInteruptSpecifier =
          interruptParent.getProperty("#interrupt-cells");

        if (!parentUnitAddress) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
              values.value.values[i],
              DiagnosticSeverity.Error,
              [...interruptParent.definitons],
              [],
              [
                property.name,
                "#address-cells",
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
        }

        if (!parentInteruptSpecifier) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPETY_IN_NODE,
              values.value.values[i],
              DiagnosticSeverity.Error,
              [...interruptParent.definitons],
              [],
              [
                property.name,
                "#interrupt-cells",
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
        }

        if (issues.length) {
          break;
        }

        i++;

        const parentUnitAddressValue = getU32ValueFromProperty(
          parentUnitAddress!,
          0,
          0
        );
        const parentInteruptSpecifierValue = getU32ValueFromProperty(
          parentInteruptSpecifier!,
          0,
          0
        );

        if (
          parentUnitAddressValue == null ||
          parentInteruptSpecifierValue == null
        ) {
          break;
        }

        i += parentUnitAddressValue + parentInteruptSpecifierValue;
        if (values.value.values.length < i) {
          const expLen =
            childAddressCellsValue +
            childInteruptSpecifierValue +
            1 +
            parentUnitAddressValue +
            parentInteruptSpecifierValue;
          issues.push(
            genIssue(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values.value.values[values.value.values.length - 1],
              DiagnosticSeverity.Error,
              [],
              [],
              [
                property.name,
                `after the last value of ${[
                  ...Array.from(
                    { length: childAddressCellsValue },
                    () => "ChildAddress"
                  ),
                  ...Array.from(
                    { length: childInteruptSpecifierValue },
                    () => "ChildInterruptSpecifier"
                  ),
                  "InterruptParent",
                  ...Array.from(
                    { length: parentUnitAddressValue },
                    () => "ParentUnitAddress"
                  ),
                  ...Array.from(
                    { length: parentInteruptSpecifierValue },
                    () => "ParentInterruptSpecifier"
                  ),
                ]
                  .slice(
                    (values.value.values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.value.values.length - entryEndIndex) % expLen
                  )
                  .join(" ")} ....`,
              ]
            )
          );
          break;
        }
        entryEndIndex = i;
      }

      return issues;
    }
  );
