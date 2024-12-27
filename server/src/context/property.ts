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

import { DtcProperty } from "../ast/dtc/property";
import { ContextIssues, Issue, SearchableResult } from "../types";
import {
  DiagnosticSeverity,
  DiagnosticTag,
  Position,
} from "vscode-languageserver";
import { getDeepestAstNodeInBetween } from "../helpers";
import { LabelAssign } from "../ast/dtc/label";
import { type Node } from "./node";

export class Property {
  replaces?: Property;
  replacedBy?: Property;
  constructor(public readonly ast: DtcProperty, public readonly parent: Node) {}

  getDeepestAstNode(
    file: string,
    position: Position
  ): Omit<SearchableResult, "runtime"> {
    return {
      item: this,
      ast: getDeepestAstNodeInBetween(this.ast, file, position),
    };
  }

  get name() {
    return this.ast.propertyName?.name ?? "[UNSET]";
  }

  get labels(): LabelAssign[] {
    return this.ast.allDescendants.filter(
      (c) => c instanceof LabelAssign
    ) as LabelAssign[];
  }

  get labelsMapped(): {
    label: LabelAssign;
    owner: Property | null;
  }[] {
    return this.labels.map((l) => ({
      label: l,
      owner: this.ast.labels.some((ll) => ll === l) ? this : null,
    }));
  }

  get issues(): Issue<ContextIssues>[] {
    return this.replacedIssues;
  }

  get replacedIssues(): Issue<ContextIssues>[] {
    return [
      ...(this.replaces?.replacedIssues ?? []),
      ...(this.replaces
        ? [
            {
              issues: [ContextIssues.DUPLICATE_PROPERTY_NAME],
              severity: DiagnosticSeverity.Hint,
              astElement: this.replaces.ast,
              linkedTo: [this.ast],
              tags: [DiagnosticTag.Unnecessary],
              templateStrings: [this.name],
            },
          ]
        : []),
    ];
  }

  get allReplaced(): Property[] {
    return this.replaces ? [this.replaces, ...this.replaces.allReplaced] : [];
  }

  toString() {
    return this.ast.toString();
  }
}
