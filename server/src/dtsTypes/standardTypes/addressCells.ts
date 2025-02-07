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

import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () => {
  const prop = new PropertyNodeType(
    "#address-cells",
    generateOrTypeObj(PropertyType.U32),
    "optional",
    2
  );

  prop.description = [
    `The #address-cells and #size-cells properties may be used in any device node that has children in the devicetree hierarchy and describes how child device nodes should be addressed. The #address-cells property defines the number of <u32> cells used to encode the address field in a child node's reg property. The #size-cells property defines the number of <u32 > cells used to encode the size field in a child node's reg property.`,
    `The #address-cells and #size-cells properties are not inherited from ancestors in the devicetree. They shall be explicitly defined.`,
    `A DTSpec-compliant boot program shall supply #address-cells and #size-cells on all nodes that have children.`,
    `If missing, a client program should assume a default value of 2 for #address-cells, and a value of 1 for #size-cells.`,
  ];
  prop.examples = [
    "See the following devicetree excerpt:",
    [
      "```devicetree",
      `SOC {
\t#address-cells = <1>;
\t\t#size-cells = <1>;
\t\tserial@4600 {
\t\tcompatible = "ns16550";
\t\treg = <0x4600 0x100>;
\t\tclock-frequency = <0>;
\t\tinterrupts = <0xA 0x8>;
\t\tinterrupt-parent = <&ipic>;
\t};
};`,
      "```",
    ].join("\n"),
    "In this example, the #address-cells and #size-cells properties of the soc node are both set to 1. This setting specifies that one cell is required to represent an address and one cell is required to represent the size of nodes that are children of this node.",
    "The serial device reg property necessarily follows this specification set in the parent (soc) node— the address is represented by a single cell (0x4600), and the size is represented by a single cell (0x100).",
  ];
  return prop;
};
