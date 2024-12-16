/* eslint-disable no-mixed-spaces-and-tabs */
import { DtcProperty } from "../ast/dtc/property";
import { ContextIssues, Issue, SearchableResult } from "../types";
import {
  DiagnosticSeverity,
  DiagnosticTag,
  Position,
} from "vscode-languageserver";
import { getDeepestAstNodeInBetween } from "../helpers";
import { LabelAssign } from "../ast/dtc/label";
import { LabelRef } from "../ast/dtc/labelRef";
import { AllValueType, LabelValue } from "../ast/dtc/types";
import { type Node } from "./node";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { NodePathRef } from "../ast/dtc/values/nodePath";

export class Property {
  replaces?: Property;
  replacedBy?: Property;
  constructor(public readonly ast: DtcProperty, public readonly parent: Node) {}

  getDeepestAstNode(
    previousFiles: string[],
    file: string,
    position: Position
  ): Omit<SearchableResult, "runtime"> {
    return {
      item: this,
      ast: getDeepestAstNodeInBetween(this.ast, previousFiles, file, position),
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

  get nodeRefValues(): LabelValue[] {
    const values = this.ast.values?.values
      .filter((v) => v)
      .flatMap((v) => v?.value)
      .filter((v) => v) as AllValueType[] | undefined;
    if (!values) return [];

    const result = [
      ...((
        values.filter((c) => c instanceof LabelRef && c.value) as LabelRef[]
      ).map((r) => ({ ast: r, label: r.value })) as LabelValue[]),
      ...(values
        .flatMap((c) => {
          if (c instanceof ArrayValues) {
            return c.values
              .map((v) => v.value)
              .filter((v) => v instanceof LabelRef) as LabelRef[];
          }
          return [];
        })
        .map((r) => ({ ast: r, label: r.value })) as LabelValue[]),
    ];

    return result;
  }

  get nodePathRefValues(): NodePathRef[] {
    const values = this.ast.values?.values
      .filter((v) => v)
      .flatMap((v) => v?.value)
      .filter((v) => v) as AllValueType[] | undefined;
    if (!values) return [];

    const result = values.flatMap((c) => {
      if (c instanceof ArrayValues) {
        return c.values
          .map((v) => v.value)
          .filter((v) => v instanceof NodePathRef) as NodePathRef[];
      }
      if (c instanceof NodePathRef) {
        return [c];
      }
      return [];
    }) as NodePathRef[];

    return result;
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
}
