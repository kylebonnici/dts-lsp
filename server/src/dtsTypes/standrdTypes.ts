import { type Node } from "../context/node";
import compatible from "./standardTypes/compatible";
import deviceType from "./standardTypes/deviceType";
import interruptCells from "./standardTypes/interruptCells";
import interruptController from "./standardTypes/interruptController";
import interruptParent from "./standardTypes/interruptParent";
import interrupts from "./standardTypes/interrupts";
import interruptsExtended from "./standardTypes/interruptsExtended";
import { NodeType } from "./types";
import dmaNoncoherent from "./standardTypes/dmaNoncoherent";
import dmaCoherent from "./standardTypes/dmaCoherent";
import dmaRanges from "./standardTypes/dmaRanges";
import ranges from "./standardTypes/ranges";
import virtualReg from "./standardTypes/virtualReg";
import reg from "./standardTypes/reg";
import sizeCells from "./standardTypes/sizeCells";
import addressCells from "./standardTypes/addressCells";
import status from "./standardTypes/status";
import phandel from "./standardTypes/phandel";
import model from "./standardTypes/model";
import name from "./standardTypes/name";
import interruptMap from "./standardTypes/interruptMap";
import interruptMapMask from "./standardTypes/interruptMapMask";
import nexusSpecifierMap from "./standardTypes/nexusSpecifierMap";

export function getStandardType(node: Node) {
  const standardType = new NodeType(node);
  standardType.properties.push(
    compatible(),
    model(),
    phandel(),
    status(),
    addressCells(),
    sizeCells(),
    reg(),
    virtualReg(),
    ranges(),
    dmaRanges(),
    dmaCoherent(),
    dmaNoncoherent(),
    name(),
    deviceType(),
    interrupts(),
    interruptParent(),
    interruptsExtended(),
    interruptCells(),
    interruptController(),
    interruptMap(),
    interruptMapMask(),
    nexusSpecifierMap()
  );
  return standardType;
}
