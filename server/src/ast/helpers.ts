import { ASTBase } from "./base";
import { DeleteBase } from "./dtc/delete";
import { LabelRef } from "./dtc/labelRef";
import { DtcBaseNode, DtcChildNode, DtcRefNode, NodeName } from "./dtc/node";
import { DtcProperty } from "./dtc/property";

export const isDeleteChild = (ast: ASTBase): boolean => {
  if (ast instanceof DeleteBase) {
    return true;
  }

  if (ast instanceof DtcBaseNode) {
    return false;
  }

  return ast.parentNode ? isDeleteChild(ast.parentNode) : false;
};

export const isPropertyChild = (ast: ASTBase): boolean => {
  if (ast instanceof DtcProperty) {
    return true;
  }

  if (ast instanceof DtcBaseNode) {
    return false;
  }

  return ast.parentNode ? isPropertyChild(ast.parentNode) : false;
};

export const getNodeNameOrNodeLabelRef = (nodes: DtcBaseNode[]) => {
  const filteredNodes = nodes.filter(
    (n) => n instanceof DtcChildNode || n instanceof DtcRefNode
  ) as (DtcChildNode | DtcRefNode)[];

  return [
    ...filteredNodes.map((n) =>
      n instanceof DtcChildNode ? n.name : n.labelReference
    ),
  ].filter((a) => !!a) as (NodeName | LabelRef)[];
};
