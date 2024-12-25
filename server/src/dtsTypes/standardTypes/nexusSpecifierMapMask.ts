import { PropertyNodeType, PropertyType } from "../types";
import { generateOrTypeObj } from "./helpers";

export default () => {
  const prop = new PropertyNodeType((name) => {
    if (name.startsWith("interrupt-")) {
      return false;
    }

    return !!name.match(/^[A-Z-a-z]+-map-mask$/);
  }, generateOrTypeObj(PropertyType.PROP_ENCODED_ARRAY));
  prop.list = true;
  return prop;
};
