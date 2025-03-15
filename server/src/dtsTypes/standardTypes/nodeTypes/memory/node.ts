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

import { NodeType } from "../../../types";
import addressCells from "../../addressCells";
import dmaCoherent from "../../dmaCoherent";
import dmaNoncoherent from "../../dmaNoncoherent";
import dmaRanges from "../../dmaRanges";
import model from "../../model";
import phandle from "../../phandle";
import ranges from "../../ranges";
import reg from "../../reg";
import sizeCells from "../../sizeCells";
import status from "../../status";
import virtualReg from "../../virtualReg";
import deviceType from "../../deviceType";
import interrupts from "../../interrupts";
import interruptParent from "../../interruptParent";
import interruptsExtended from "../../interruptsExtended";
import interruptCells from "../../interruptCells";
import interruptController from "../../interruptController";
import interruptMap from "../../interruptMap";
import interruptMapMask from "../../interruptMapMask";
import nexusSpecifierMap from "../../nexusSpecifierMap";
import nexusSpecifierMapMask from "../../nexusSpecifierMapMask";
import nexusSpecifierMapPassThru from "../../nexusSpecifierMapPassThru";
import nexusSpecifierCells from "../../nexusSpecifierCells";
import name from "../../name";
import compatible from "../../compatible";

export function getMemoryNodeType() {
  const nodeType = new NodeType();
  const deviceTypeProp = deviceType();
  deviceTypeProp.required = () => {
    return "required";
  };

  const regProp = reg();
  regProp.required = () => {
    return "required";
  };

  nodeType.addProperty([
    deviceTypeProp,
    regProp,

    // optional
    addressCells(),
    sizeCells(),
    model(),
    compatible(),
    phandle(),
    status(),
    reg(),
    virtualReg(),
    ranges(),
    dmaRanges(),
    dmaCoherent(),
    dmaNoncoherent(),
    name(),
    interrupts(),
    interruptParent(),
    interruptsExtended(),
    interruptCells(),
    interruptController(),
    interruptMap(),
    interruptMapMask(),
    nexusSpecifierMap(),
    nexusSpecifierMapMask(),
    nexusSpecifierMapPassThru(),
    nexusSpecifierCells(),
  ]);
  return nodeType;
}
