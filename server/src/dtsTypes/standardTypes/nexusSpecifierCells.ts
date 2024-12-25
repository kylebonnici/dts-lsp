import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () => {
  const prop = new PropertyNodeType((name) => {
    if (name.startsWith("interrupt-")) {
      return false;
    }

    return !!name.match(/^#[A-Z-a-z]+-cells$/);
  }, generateOrTypeObj(PropetyType.U32));
  prop.list = true;
  return prop;
};
