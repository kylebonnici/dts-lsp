import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "compatible",
    generateOrTypeObj(PropertyType.STRINGLIST)
  );
