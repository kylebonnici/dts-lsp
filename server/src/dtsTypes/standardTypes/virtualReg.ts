import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("virtual-reg", generateOrTypeObj(PropetyType.U32));
