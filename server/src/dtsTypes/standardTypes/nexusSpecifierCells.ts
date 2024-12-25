import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () => {
  const prop = new PropertyNodeType((name) => {
    if (
      name.startsWith("#address-") ||
      name.startsWith("#interrupt-") ||
      name.startsWith("#size-")
    ) {
      return false;
    }

    return !!name.match(/^#[A-Z-a-z]+-cells$/);
  }, generateOrTypeObj(PropertyType.U32));
  prop.list = true;
  return prop;
};
