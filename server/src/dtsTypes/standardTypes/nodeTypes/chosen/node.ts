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

import { genIssue } from "../../../../helpers";
import { PropertyNodeType, PropertyType } from "../../../types";
import { generateOrTypeObj } from "../../helpers";
import { StandardTypeIssue } from "../../../../types";
import { DiagnosticSeverity } from "vscode-languageserver";
import { getStandardDefaultType } from "../../../../dtsTypes/standardDefaultType";

export function getChosenNodeType() {
  const nodeType = getStandardDefaultType();
  nodeType.additionalValidations = (_, node) => {
    if (node.parent?.name !== "/") {
      return [
        genIssue(
          StandardTypeIssue.NODE_LOCATION,
          node.definitions[0],
          DiagnosticSeverity.Error,
          node.definitions.slice(1),
          [],
          ["Chosen node can only be added to a root node"]
        ),
      ];
    }
    return [];
  };

  const bootargsProp = new PropertyNodeType(
    "bootargs",
    generateOrTypeObj(PropertyType.STRING)
  );
  bootargsProp.description = [
    `A string that specifies the boot arguments for
theclientprogram. Thevaluecouldpotentially
be a null string if no boot arguments are re-
quired.`,
  ];

  const stdoutPathProp = new PropertyNodeType(
    "stdout-path ",
    generateOrTypeObj(PropertyType.STRING)
  );
  stdoutPathProp.description = [
    `A string that specifies the full path to the node
representingthedevicetobeusedforbootcon-
soleoutput. Ifthecharacter“:”ispresentinthe
valueit terminates thepath. Thevalue maybe
an alias. If the stdin-path property is not spec-
ified, stdout-path should be assumed to define
theinput device.`,
  ];

  const stdinPathProp = new PropertyNodeType(
    "stdin-path ",
    generateOrTypeObj(PropertyType.STRING)
  );
  stdinPathProp.description = [
    `A string that specifies the boot arguments for
theclientprogram. Thevaluecouldpotentially
be a null string if no boot arguments are re-
quired.`,
  ];
  nodeType.addProperty([bootargsProp, stdoutPathProp, stdinPathProp]);

  return nodeType;
}
