import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "status",
    generateOrTypeObj(PropertyType.STRING),
    "optional",
    "okay",
    ["okay", "disabled", "reserved", "fail", "fail-sss"]
  );
