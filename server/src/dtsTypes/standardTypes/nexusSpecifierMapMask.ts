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
  const prop = new PropertyNodeType((name) => {
    if (name.startsWith("interrupt-")) {
      return false;
    }

    return !!name.endsWith("-map-mask");
  }, generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY));

  prop.desctiption = [
    "A `<specifier>-map-mask` property may be specified for a nexus node. This property specifies a mask that is ANDed with the child unit specifier being looked up in the table specified in the `<specifier>-map` property. If this propertyis notspecified, the maskis assumedto be a mask with all bits set.",
  ];
  return prop;
};
