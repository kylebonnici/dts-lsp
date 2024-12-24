import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "#size-cells",
    generateOrTypeObj(PropetyType.U32),
    "optional",
    1
  );
