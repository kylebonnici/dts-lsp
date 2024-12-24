import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("#interrupt-cells", generateOrTypeObj(PropetyType.U32));
