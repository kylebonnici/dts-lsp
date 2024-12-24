import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "interrupt-map-mask",
    generateOrTypeObj(PropetyType.PROP_ENCODED_ARRAY)
  );
