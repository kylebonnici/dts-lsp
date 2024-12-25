import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "#size-cells",
    generateOrTypeObj(PropertyType.U32),
    "optional",
    1
  );
