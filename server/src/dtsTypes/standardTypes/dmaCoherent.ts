import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("dma-coherent", generateOrTypeObj(PropetyType.EMPTY));
