import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "dma-noncoherent",
    generateOrTypeObj(PropertyType.EMPTY)
  );
