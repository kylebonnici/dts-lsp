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

import { getStandardDefaultType } from "../../../standardDefaultType";
import nonpostedMmio from "./nonpostedMmio";

export function getSimpleBusType() {
  const simpleBus = getStandardDefaultType();
  simpleBus.noMismatchPropertiesAllowed = true;

  const compatibleProp = simpleBus.properties.find(
    (p) => p.name === "compatible"
  );
  compatibleProp!.required = () => "required";

  const rangesProp = simpleBus.properties.find((p) => p.name === "ranges");
  rangesProp!.required = () => "required";

  simpleBus.addProperty(nonpostedMmio());

  return simpleBus;
}
