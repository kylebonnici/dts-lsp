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

import { getStandardDefaultType } from "src/dtsTypes/standardDefaultType";
import chassisType from "./chassisType";
import serialNumber from "./serialNumber";

export function getRootNodeType() {
  const standardType = getStandardDefaultType();
  standardType.noMismatchPropertiesAllowed = true;

  const addressCellsProp = standardType.properties.find(
    (p) => p.name === "#address-cells"
  );
  addressCellsProp!.required = () => {
    return "required";
  };

  const sizeCellsProp = standardType.properties.find(
    (p) => p.name === "#size-cells"
  );
  sizeCellsProp!.required = () => {
    return "required";
  };

  const modelProp = standardType.properties.find((p) => p.name === "model");
  modelProp!.required = () => {
    return "required";
  };

  const compatibleProp = standardType.properties.find(
    (p) => p.name === "compatible"
  );
  compatibleProp!.required = () => {
    return "required";
  };

  standardType.addProperty([chassisType(), serialNumber()]);
  return standardType;
}
