import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "interrupt-controller",
    generateOrTypeObj(PropertyType.EMPTY),
    "optional"
  );
