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
    "interrupt-map-mask",
    generateOrTypeObj(BindingPropertyType.PROP_ENCODED_ARRAY)
  );
  prop.description = [
    "An interrupt-map-mask property is specified for a nexus node in the interrupt tree. This property specifies a mask that is ANDed with the incoming unit interrupt specifier being looked up in the table specified in the interrupt-mapproperty.",
  ];

  return prop;
};
