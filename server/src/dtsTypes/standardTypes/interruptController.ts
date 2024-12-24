import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType(
    "interrupt-controller",
    generateOrTypeObj(PropetyType.EMPTY),
    "optional"
  );
