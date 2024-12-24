import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () =>
  new PropertyNodeType("dma-noncoherent", generateOrTypeObj(PropetyType.EMPTY));
