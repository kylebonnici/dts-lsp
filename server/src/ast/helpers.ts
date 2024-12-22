import { ASTBase } from "./base";
import { DeleteBase } from "./dtc/delete";
import { DtcBaseNode } from "./dtc/node";
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
