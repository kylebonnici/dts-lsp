import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("compatible", generateOrTypeObj(PropetyType.STRINGLIST));
