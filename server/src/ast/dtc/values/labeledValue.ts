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
import { LabelAssign } from "../label";

export class LabeledValue<T extends ASTBase> extends ASTBase {
  constructor(
    public readonly value: T | null,
    public readonly labels: LabelAssign[]
  ) {
    super();
    this.labels.forEach((label) => {
      this.addChild(label);
    });
    this.addChild(this.value);
  }

  toString() {
    return `${this.labels.map((l) => l.toString()).join(" ")}${
      this.value?.toString() ?? "NULL"
    }`;
  }
}
