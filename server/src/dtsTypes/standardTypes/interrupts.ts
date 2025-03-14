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

import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj, resolvePhandleNode } from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () => {
  const prop = new PropertyNodeType(
    "interrupts",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY),
    "optional",
    undefined,
    [],
    (property) => {
      const issues: Issue<StandardTypeIssue>[] = [];

      const node = property.parent;
      const interruptParent = node.getProperty("interrupt-parent");
      const root = node.root;
      const parentInterruptNode = interruptParent
        ? resolvePhandleNode(interruptParent?.ast.values?.values.at(0), root)
        : node.parent;

      if (!parentInterruptNode) {
        if (!interruptParent) {
          issues.push(
            genIssue(
              StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
              property.ast,
              DiagnosticSeverity.Error,
              [...property.parent.nodeNameOrLabelRef],
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
              StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
              interruptParent.ast.values?.values.at(0)?.value ??
                interruptParent.ast
            )
          );
          return issues;
        }
      }

      return issues;
    }
  );
  prop.description = [
    "The interrupts property of a device node defines the interrupt or interrupts that are generated by the device.The value of the interrupts property consists of an arbitrary number of interrupt specifiers. The format of an interrupt specifier is defined by the binding of the interrupt domain root.",
    "interrupts is overridden by the interrupts-extended property and normally only one or the other should be used.",
  ];
  prop.examples = [
    "A common definition of an interrupt specifier in an open PIC-compatible interrupt domain consists of two cells; an interrupt number and level/sense information. See the following example, which defines a single interrupt specifier, with an interrupt number of OxA and level/sense encoding of 8.",
    "```devicetree\ninterrupts = <0xA 8>;\n```",
  ];
  return prop;
};
