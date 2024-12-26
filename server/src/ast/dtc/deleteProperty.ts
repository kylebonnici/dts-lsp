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

import { Keyword } from "../keyword";
import { PropertyName } from "./property";
import { DeleteBase } from "./delete";

export class DeleteProperty extends DeleteBase {
  private _propertyName: PropertyName | null = null;

  constructor(keyword: Keyword) {
    super("Delete Property", keyword);
  }

  set propertyName(propertyName: PropertyName | null) {
    if (this._propertyName)
      throw new Error("Only only property name is allowed");
    this._propertyName = propertyName;
    this.addChild(propertyName);
  }

  get propertyName() {
    return this._propertyName;
  }
}
