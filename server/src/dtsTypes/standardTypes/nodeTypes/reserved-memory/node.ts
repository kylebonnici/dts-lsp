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

import { NodeType, PropertyType } from "../../../types";
import { getStandardDefaultType } from "../../../../dtsTypes/standardDefaultType";
import { generateOrTypeObj, getU32ValueFromProperty } from "../../helpers";
import { genIssue } from "src/helpers";
import { Issue, StandardTypeIssue } from "src/types";
import { DiagnosticSeverity } from "vscode-languageserver";
import { Property } from "src/context/property";
import addressCells from "../../addressCells";
import sizeCells from "../../sizeCells";
import ranges from "../../ranges";

const matchRootNode = (
  additionalTypeCheck:
    | ((property: Property) => Issue<StandardTypeIssue>[])
    | undefined,
  property: Property
) => {
  const issues = additionalTypeCheck?.(property) ?? [];

  const rootNodeAddressCells = property.parent.root.getProperty(property.name);
  const rootNodeAddressCellsValue = rootNodeAddressCells
    ? getU32ValueFromProperty(rootNodeAddressCells, 0, 0)
    : undefined;

  const nodeAddressCells = property.parent.getProperty(property.name);
  const nodeAddressCellsValue = nodeAddressCells
    ? getU32ValueFromProperty(nodeAddressCells, 0, 0)
    : undefined;

  if (nodeAddressCellsValue !== rootNodeAddressCellsValue) {
    issues.push(
      genIssue(
        StandardTypeIssue.INVALID_VALUE,
        property.ast,
        DiagnosticSeverity.Error,
        [...(rootNodeAddressCells?.ast ? [rootNodeAddressCells.ast] : [])],
        undefined,
        ["#address-cells value in this node must match value of root node"]
      )
    );
  }
  return issues;
};

export function getReservedMemoryNodeType() {
  const nodeType = new NodeType();

  nodeType.noMismatchPropertiesAllowed = true;

  const addressCellsProp = addressCells();
  const addressAdditionalTypeCheck = addressCellsProp?.additionalTypeCheck;
  addressCellsProp!.additionalTypeCheck = (property) => {
    return matchRootNode(addressAdditionalTypeCheck, property);
  };
  addressCellsProp!.required = () => "required";

  const sizeCellsProp = sizeCells();
  const sizeCellsAdditionalTypeCheck = sizeCellsProp?.additionalTypeCheck;
  sizeCellsProp!.additionalTypeCheck = (property) => {
    return matchRootNode(sizeCellsAdditionalTypeCheck, property);
  };
  sizeCellsProp!.required = () => "required";

  const rangesProp = ranges();
  rangesProp!.required = () => "required";
  rangesProp!.type = generateOrTypeObj(PropertyType.EMPTY);
  rangesProp!.additionalTypeCheck = undefined;

  nodeType.addProperty([addressCellsProp, sizeCellsProp, rangesProp]);

  return nodeType;
}
