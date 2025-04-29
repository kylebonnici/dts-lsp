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
import { PropertyNodeType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () => {
  const prop = new PropertyNodeType(
    /^(?!interrupt-).*?-map-pass-thru$/,
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY)
  );
  prop.description = [
    "A `<specifier>-map-pass-thru` property may be specified for a nexus node. This property specifies a mask that is applied to the child unit specifier being looked up in the table specified in the `<specifier>-map` property. Any matching bits in the child unit specifier are copied over to the parent specifier. If this property is not specified, the mask isassumedtobe amaskwithno bits set.",
  ];
  return prop;
};
