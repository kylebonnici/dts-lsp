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
    "status",
    generateOrTypeObj(PropertyType.STRING),
    "optional",
    "okay",
    ["okay", "disabled", "reserved", "fail", "fail-sss"]
  );
  prop.desctiption = [
    `The status property indicates the operational status of a device.
   The lack of a status property should betreated as if the property existed with the value of "okay"`,
  ];
  return prop;
};
