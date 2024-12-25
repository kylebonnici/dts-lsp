import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "interrupt-map-mask",
    generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY)
  );
