/*
 * Copyright 2024 Kyle Micallef Bonnici
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ASTBase } from "./base";
import { DeleteBase } from "./dtc/delete";
import { LabelRef } from "./dtc/labelRef";
import {
  DtcBaseNode,
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "./dtc/node";
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
  return [
    ...nodes.map((n) => {
      if (n instanceof DtcChildNode) {
        return n.name;
      }

      if (n instanceof DtcRootNode) {
        return n.name;
      }

      if (n instanceof DtcRefNode) {
        return n.reference;
      }
    }),
  ].filter((a) => !!a) as (NodeName | LabelRef)[];
};

export const isChildOfAstNode = (parent: ASTBase, ast?: ASTBase): boolean => {
  if (!ast) {
    return false;
  }

  return ast.parentNode === parent || isChildOfAstNode(parent, ast.parentNode);
};
