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
    "dma-coherent",
    generateOrTypeObj(BindingPropertyType.EMPTY)
  );
  prop.description = [
    "For architectures which are by default non-coherent for I/O, the dma-coherent property is used to indicate a device is capable of coherent DMA operations. Some architectures have coherent DMA by default and this property is not applicable.",
  ];
  return prop;
};
