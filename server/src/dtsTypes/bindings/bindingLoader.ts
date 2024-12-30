import { Node } from "../../context/node";
import { NodeType } from "../types";
import { getZephyrBindingsLoader } from "./zephyr/loader";

export type BindingType = "Zephyr";

export interface BindingLoader {
  getNodeTypes(node: Node): NodeType[];
}

export const getBindingLoader = (
  folders: string[],
  type: BindingType
): BindingLoader => ({
  getNodeTypes: (node: Node) => {
    switch (type) {
      case "Zephyr":
        return getZephyrBindingsLoader().getNodeTypes(folders, node);
    }
  },
});
