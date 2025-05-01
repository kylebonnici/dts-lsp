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

import { BindingPropertyType } from "../../types/index";
import { FileDiagnostic, StandardTypeIssue } from "../../types";
import { PropertyNodeType } from "../types";
import {
  flatNumberValues,
  generateOrTypeObj,
  resolvePhandleNode,
  getU32ValueFromProperty,
} from "./helpers";
import { createTokenIndex, genStandardTypeDiagnostic } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";
import { ASTBase } from "../../ast/base";
import { Expression } from "src/ast/cPreprocessors/expression";

export default () => {
  const prop = new PropertyNodeType<number>(
    /^(?!interrupt-|no-).*?-map$/,
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    undefined,
    (property, macros) => {
      const specifier = property.name.split("-map", 1)[0];

      const issues: FileDiagnostic[] = [];
      const node = property.parent;
      const root = property.parent.root;
      const childSpecifierCells = node.getProperty(`#${specifier}-cells`);

      if (!childSpecifierCells) {
        issues.push(
          genStandardTypeDiagnostic(
            StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
            property.ast,
            DiagnosticSeverity.Error,
            [...node.nodeNameOrLabelRef],
            [],
            [
              property.name,
              `#${specifier}-cells`,
              `/${node.path.slice(1).join("/")}`,
            ]
          )
        );
        return issues;
      }

      const childSpecifierCellsValue = getU32ValueFromProperty(
        childSpecifierCells,
        0,
        0,
        macros
      );

      if (childSpecifierCellsValue == null) {
        return issues;
      }

      const values = flatNumberValues(property.ast.values);
      if (!values?.length) {
        return [];
      }

      const keys: { [key: string]: ASTBase[] } = {};

      let i = 0;
      let entryEndIndex = 0;
      while (i < values.length) {
        const keyItem = new ASTBase(
          createTokenIndex(
            values.at(i)!.firstToken,
            values.at(childSpecifierCellsValue + i - 1)!.lastToken
          )
        );

        let key = "";
        for (let j = i; j < childSpecifierCellsValue + i; j++) {
          const value = values[j];
          key += `${
            value instanceof Expression
              ? value.evaluate(macros).toString()
              : value.toString()
          }:`;
        }

        keys[key] ??= [];
        keys[key].push(keyItem);

        i += childSpecifierCellsValue;
        prop.typeExample ??= "";
        prop.typeExample += `<${[
          ...Array.from(
            { length: childSpecifierCellsValue },
            () => "ChildSpecifier"
          ),
          "SpecifierParent ParentSpecifier",
        ].join(" ")}> `;

        if (values.length < i + 1) {
          const expLen = childSpecifierCellsValue + 1;
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values[values.length - 1],
              DiagnosticSeverity.Error,
              [],
              [],
              [
                property.name,
                `after the last value of ${[
                  ...Array.from(
                    { length: childSpecifierCellsValue },
                    () => "ChildSpecifier"
                  ),
                  "SpecifierParent ParentSpecifier...",
                ]
                  .slice(
                    (values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        const specifierParent = resolvePhandleNode(values[i], root);
        if (!specifierParent) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              values[i],
              DiagnosticSeverity.Error
            )
          );
          break;
        }

        const parentSpecifierAddress = specifierParent.getProperty(
          `#${specifier}-cells`
        );

        if (!parentSpecifierAddress) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              values[i],
              DiagnosticSeverity.Error,
              [...specifierParent.nodeNameOrLabelRef],
              [],
              [
                property.name,
                `#${specifier}-cells`,
                `/${node.path.slice(1).join("/")}`,
              ]
            )
          );
          return issues;
        }

        i++;

        const parentUnitAddressValue = getU32ValueFromProperty(
          parentSpecifierAddress,
          0,
          0,
          macros
        );

        if (parentUnitAddressValue == null) {
          break;
        }

        i += parentUnitAddressValue;
        if (values.length < i) {
          const expLen = childSpecifierCellsValue + 1 + parentUnitAddressValue;
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.MAP_ENTRY_INCOMPLETE,
              values[values.length - 1],
              DiagnosticSeverity.Error,
              [],
              [],
              [
                property.name,
                `after the last value of ${[
                  ...Array.from(
                    { length: childSpecifierCellsValue },
                    () => "ChildSpecifier"
                  ),
                  "InterruptParent",
                  ...Array.from(
                    { length: parentUnitAddressValue },
                    () => "ParentSpecifier"
                  ),
                ]
                  .slice(
                    (values.length - entryEndIndex) % expLen === 0
                      ? expLen
                      : (values.length - entryEndIndex) % expLen
                  )
                  .join(" ")}`,
              ]
            )
          );
          break;
        }
        entryEndIndex = i;
      }

      prop.typeExample ??= `<${[
        ...Array.from(
          { length: childSpecifierCellsValue },
          () => "ChildSpecifier"
        ),
        "SpecifierParent ParentSpecifier",
      ].join(" ")}>`;

      Object.values(keys).forEach((v) => {
        if (v.length > 1) {
          issues.push(
            genStandardTypeDiagnostic(
              StandardTypeIssue.DUPLICATE_MAP_ENTRY,
              v[v.length - 1],
              DiagnosticSeverity.Error,
              v.slice(0, -1)
            )
          );
        }
      });
      return issues;
    }
  );
  prop.description = [
    "A `‹specifier>-map` is a property in a nexus node that bridges one specifier domain with a set of parent specifier domains and describes how specifiers in the child domain are mapped to their respective parent domains.",
    "The map is a table where each row is a mapping entry consisting of three components: child specifier, specifier parent, and parent specifier.",
    "- child specifier The specifier of the child node being mapped. The number of 32-bit cells required to specify this component is described by the `#<specifier>-cells` property of this node-the nexus node containing the ‹specifier>-map property.",
    "- Specifier parent A single <phandle > value that points to the specifier parent to which the child domain is being mapped.",
    "- Parent specifier: The specifier in the parent domain. The number of 32-bit cells required to specify this component is described by the `#<specifier>-cells` property of the specifier parent node.",
    "Lookups are performed on the mapping table by matching a specifier against the child specifier in the map. Because some fields in the specifier may not be relevant or need to be modified, a mask is applied before the lookup is done. This mask is defined in the `<specifier>-map-mask` property",
    "Similarly, when the specifier is mapped, some fields in the unit specifier may need to be kept unmodified and passed through from the child node to the parent node. In this case, a `<specifier>-map-pass-thru` property may be specified to apply a mask to the child specifier and copy any bits that match to the parent unit specifier.",
  ];
  prop.list = true;
  return prop;
};
