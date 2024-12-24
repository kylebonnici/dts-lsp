import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "status",
    generateOrTypeObj(PropetyType.STRING),
    "optional",
    "okay",
    ["okay", "disabled", "reserved", "fail", "fail-sss"]
  );
