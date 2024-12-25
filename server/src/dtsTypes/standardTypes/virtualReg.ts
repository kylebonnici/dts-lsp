import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("virtual-reg", generateOrTypeObj(PropertyType.U32));
