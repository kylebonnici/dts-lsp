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
    if (
      name.startsWith("#address-") ||
      name.startsWith("#interrupt-") ||
      name.startsWith("#size-")
    ) {
      return false;
    }

    return name.startsWith("#") && !!name.endsWith("-cells");
  }, generateOrTypeObj(PropertyType.U32));
  prop.list = true;
  prop.description = [
    "The `#<specifier>-cells` propertydefines the number of cells required to encode a specifier for adomain.",
  ];
  return prop;
};
