import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("model", generateOrTypeObj(PropertyType.STRING));
