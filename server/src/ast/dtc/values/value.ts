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

import { ASTBase } from "../../base";
import { AllValueType } from "../types";
import { LabelAssign } from "../label";
import { DtsBitsNode } from "../bitsNode";

export class PropertyValue extends ASTBase {
  constructor(
    public readonly startLabels: LabelAssign[],
    public readonly value: AllValueType,
    public readonly endLabels: LabelAssign[],
    public readonly bits?: DtsBitsNode
  ) {
    super();
    this.startLabels.forEach((label) => {
      this.addChild(label);
    });
    this.addChild(bits);
    this.addChild(value);
    this.endLabels.forEach((label) => {
      this.addChild(label);
    });
  }

  toString() {
    return `${[
      this.value?.toString() ?? "NULL",
      ...this.endLabels.map((l) => l.toString()),
    ].join(" ")}`;
  }

  toJson() {
    return this.value?.toJson();
  }
}
