import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("#interrupt-cells", generateOrTypeObj(PropertyType.U32));
