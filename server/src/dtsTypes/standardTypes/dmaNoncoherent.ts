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
    "dma-noncoherent",
    generateOrTypeObj(PropertyType.EMPTY)
  );
  prop.desctiption = [
    "For architectures which are by default coherent for 1/O, the dma-noncoherent property is used to indicate a device is not capable of coherent DMA operations. Some architectures have non-coherent DMA by default and this property is not applicable.",
  ];
  return prop;
};
