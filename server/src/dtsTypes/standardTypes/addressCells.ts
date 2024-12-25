import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "#address-cells",
    generateOrTypeObj(PropertyType.U32),
    "optional",
    2
  );
