import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "#address-cells",
    generateOrTypeObj(PropetyType.U32),
    "optional",
    2
  );
