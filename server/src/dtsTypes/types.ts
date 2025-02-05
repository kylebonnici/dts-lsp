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

import { genIssue, getIndentString } from "../helpers";
import { type Node } from "../context/node";
import { Property } from "../context/property";
import { Issue, StandardTypeIssue } from "../types";
import { Runtime } from "../context/runtime";
import {
  CompletionItem,
  CompletionItemKind,
  DiagnosticSeverity,
  DiagnosticTag,
  MarkupContent,
  MarkupKind,
  Position,
  TextEdit,
} from "vscode-languageserver";
import { PropertyValue } from "../ast/dtc/values/value";
import { StringValue } from "../ast/dtc/values/string";
import { ASTBase } from "../ast/base";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { LabelRef } from "../ast/dtc/labelRef";
import { NodePathRef } from "../ast/dtc/values/nodePath";
import { getNodeNameOrNodeLabelRef } from "../ast/helpers";
import { countParent } from "../getDocumentFormatting";

export enum PropertyType {
  EMPTY,
  U32,
  U64,
  STRING,
  PROP_ENCODED_ARRAY,
  STRINGLIST,
  BYTESTRING,
  UNKNOWN,
  ANY,
}

export type RequirementStatus = "required" | "omitted" | "optional";

export type TypeConfig = { types: PropertyType[] };
export class PropertyNodeType<T = string | number> {
  public required: (node: Node) => RequirementStatus;
  public values: (property: Property) => T[];
  public hideAutoComplete = false;
  public list = false;
  public desctiption?: string[];
  public examples?: string[];
  public constValue?: number | string | number[] | string[];
  public onHover = (): MarkupContent => {
    return {
      kind: MarkupKind.Markdown,
      value: [
        ...(this.desctiption
          ? ["### Desctiption", this.desctiption.join("\n\n")]
          : []),
        ...(this.examples ? ["### Example", this.examples.join("\n\n")] : []),
      ].join("\n"),
    };
  };

  constructor(
    public readonly name: string | ((n: string) => boolean),
    public readonly type: TypeConfig[],
    required:
      | RequirementStatus
      | ((node: Node) => RequirementStatus) = "optional",
    public readonly def: T | undefined = undefined,
    values: T[] | ((property: Property) => T[]) = [],
    public additionalTypeCheck?: (
      property: Property
    ) => Issue<StandardTypeIssue>[]
  ) {
    if (typeof required !== "function") {
      this.required = () => required;
    } else {
      this.required = required;
    }

    if (typeof values !== "function") {
      this.values = () =>
        def && values.indexOf(def) === -1 ? [def, ...values] : values;
    } else {
      this.values = values;
    }
  }

  getNameMatch(name: string): boolean {
    return typeof this.name === "string" ? this.name === name : this.name(name);
  }

  validateProperty(
    runtime: Runtime,
    node: Node,
    propertyName: string,
    property?: Property
  ): Issue<StandardTypeIssue>[] {
    const required = this.required(node);
    if (!property) {
      if (required === "required") {
        const childOrRefNode = runtime.getOrderedNodeAst(node);
        const orderedTree = getNodeNameOrNodeLabelRef(childOrRefNode);

        let assignTest = "";
        if (this.type.length === 1 && this.type[0].types.length === 1) {
          switch (this.type[0].types[0]) {
            case PropertyType.U32:
            case PropertyType.U64:
            case PropertyType.PROP_ENCODED_ARRAY:
              assignTest = " = <>";
              break;
            case PropertyType.STRING:
            case PropertyType.STRINGLIST:
              assignTest = ' = ""';
              break;
            case PropertyType.BYTESTRING:
              assignTest = " = []";
              break;
          }
        }

        return [
          ...childOrRefNode.map((node, i) => {
            const token = node.openScope ?? orderedTree[i].lastToken;

            return genIssue<StandardTypeIssue>(
              StandardTypeIssue.REQUIRED,
              orderedTree[i],
              DiagnosticSeverity.Error,
              [],
              [],
              [propertyName],
              TextEdit.insert(
                Position.create(token.pos.line, token.pos.col + 1),
                `\n${"".padEnd(
                  countParent(orderedTree[i].uri, node) *
                    getIndentString().length,
                  getIndentString()
                )}${propertyName}${assignTest};`
              )
            );
          }),
        ];
      }

      return [];
    } else if (required === "omitted") {
      return [
        genIssue<StandardTypeIssue>(
          StandardTypeIssue.OMITTED,
          property.ast,
          DiagnosticSeverity.Error,
          undefined,
          [],
          [propertyName]
        ),
      ];
    }

    const propTypes = propertyValuesToPropertyType(property);
    const issues: Issue<StandardTypeIssue>[] = [];

    const checkType = (
      expected: PropertyType[],
      type: PropertyType,
      ast: ASTBase | undefined | null
    ) => {
      ast ??= property.ast;

      const typeIsValid =
        expected.some((tt) => tt == type) ||
        (expected.some((tt) => tt == PropertyType.STRINGLIST) &&
          (type === PropertyType.STRING || type === PropertyType.STRINGLIST)) ||
        (expected.some((tt) => tt == PropertyType.PROP_ENCODED_ARRAY) &&
          (type === PropertyType.U32 || type === PropertyType.U64));

      if (!typeIsValid) {
        const issue: StandardTypeIssue[] = [];
        expected.forEach((tt) => {
          switch (tt) {
            case PropertyType.EMPTY:
              issue.push(StandardTypeIssue.EXPECTED_EMPTY);
              break;
            case PropertyType.STRING:
              issue.push(StandardTypeIssue.EXPECTED_STRING);
              break;
            case PropertyType.STRINGLIST:
              issue.push(StandardTypeIssue.EXPECTED_STRINGLIST);
              break;
            case PropertyType.U32:
              issue.push(StandardTypeIssue.EXPECTED_U32);
              break;
            case PropertyType.U64:
              issue.push(StandardTypeIssue.EXPECTED_U64);
              break;
            case PropertyType.PROP_ENCODED_ARRAY:
              issue.push(StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY);
              break;
          }
        });

        if (issue.length) {
          issues.push(
            genIssue(
              issue,
              ast,
              DiagnosticSeverity.Error,
              [],
              [],
              [property.name]
            )
          );
        }
      }
    };

    if (this.type[0].types.some((e) => e === PropertyType.ANY)) {
      return [];
    }

    if (this.type.length > 1) {
      const type = this.type;
      if (!this.list && this.type.length !== propTypes.length) {
        issues.push(
          genIssue(
            StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [propertyName, this.type.length.toString()]
          )
        );
      } else {
        propTypes.forEach((t, i) => {
          if (type[0].types.every((tt) => tt !== t)) {
            issues.push(
              genIssue(
                StandardTypeIssue.EXPECTED_STRINGLIST,
                property.ast.values?.values[i] ?? property.ast
              )
            );
          }
        });
      }
    } else {
      if (this.type[0].types.some((tt) => tt === PropertyType.STRINGLIST)) {
        propTypes.some((t) =>
          checkType(
            [PropertyType.STRINGLIST],
            t,
            property.ast.values?.values[0]?.value
          )
        );
      } else if (
        this.list ||
        (this.type.length === 1 &&
          this.type[0].types
            .filter((t) => t !== PropertyType.EMPTY)
            .every((tt) => tt === PropertyType.PROP_ENCODED_ARRAY))
      ) {
        propTypes.some((t) =>
          checkType(
            this.type[0].types,
            t,
            property.ast.values?.values[0]?.value
          )
        );
      } else if (
        propTypes.length > 1 &&
        this.type[0].types.some((tt) => tt !== PropertyType.EMPTY)
      ) {
        issues.push(
          genIssue(
            StandardTypeIssue.EXPECTED_ONE,
            property.ast.propertyName ?? property.ast,
            DiagnosticSeverity.Error,
            (property.ast.values?.values.slice(1) ?? []).filter(
              (v) => !!v
            ) as PropertyValue[],
            [],
            [property.name]
          )
        );
      } else if (propTypes.length === 1) {
        checkType(
          this.type[0].types,
          propTypes[0],
          property.ast.values?.values[0]?.value
        );
      }

      // we have the right type
      if (issues.length === 0) {
        issues.push(...(this.additionalTypeCheck?.(property) ?? []));
        if (
          this.values(property).length &&
          this.type[0].types.some((tt) => tt === PropertyType.STRING)
        ) {
          const currentValue = property.ast.values?.values[0]
            ?.value as StringValue;
          if (!this.values(property).some((v) => currentValue.value === v)) {
            issues.push(
              genIssue(
                StandardTypeIssue.EXPECTED_ENUM,
                property.ast.values?.values[0]?.value ?? property.ast,
                DiagnosticSeverity.Error,
                [],
                [],
                [
                  this.values(property)
                    .map((v) => `'${v}'`)
                    .join(" or "),
                ]
              )
            );
          }
        }
      }
    }

    return issues;
  }

  getPropertyCompletionItems(property: Property): CompletionItem[] {
    const currentValue = this.type.at(property.ast.values?.values.length ?? 0);
    if (currentValue?.types.some((tt) => tt === PropertyType.STRING)) {
      if (
        property.ast.values?.values &&
        property.ast.values.values?.length > 1
      ) {
        return [];
      }

      return this.values(property).map((v) => ({
        label: `"${v}"`,
        kind: CompletionItemKind.Variable,
        sortText: v === this.def ? `A${v}` : `Z${v}`,
      }));
    }

    if (
      currentValue?.types.some(
        (tt) => tt === PropertyType.U32 || tt === PropertyType.U64
      )
    ) {
      return this.values(property).map((v) => ({
        label: `<${v}>`,
        kind: CompletionItemKind.Variable,
        sortText: v === this.def ? `A${v}` : `Z${v}`,
      }));
    }

    return [];
  }
}

const propertyValuesToPropertyType = (property: Property): PropertyType[] => {
  return property.ast.values
    ? property.ast.values.values.map((v) => propertyValueToPropertyType(v))
    : [PropertyType.EMPTY];
};

const propertyValueToPropertyType = (
  value: PropertyValue | null
): PropertyType => {
  if (!value) {
    return PropertyType.UNKNOWN;
  }
  if (value.value instanceof StringValue) {
    return PropertyType.STRING;
  }

  if (value.value instanceof ArrayValues) {
    if (value.value.values.length === 1) {
      return PropertyType.U32;
    } else if (value.value.values.length === 2) {
      return PropertyType.U64;
    } else {
      return PropertyType.PROP_ENCODED_ARRAY;
    }
  }

  if (value.value instanceof LabelRef || value.value instanceof NodePathRef) {
    return PropertyType.U32;
  }

  return PropertyType.BYTESTRING;
};

export abstract class INodeType {
  abstract getIssue(runtime: Runtime, node: Node): Issue<StandardTypeIssue>[];
  abstract getOnPropertyHover(name: string): MarkupContent | undefined;
  abstract childNodeType: INodeType | undefined;
  onBus?: string;
  bus?: string[];
  description?: string;
  maintainers?: string[];
  examples?: string[];
  cellsValues?: {
    specifier: string;
    values: string[];
  }[];
  bindingsPath?: string;
  compatible?: string;
}

export class NodeType extends INodeType {
  private _properties: PropertyNodeType[] = [];
  _childNodeType?: NodeType;

  getIssue(runtime: Runtime, node: Node) {
    const issue: Issue<StandardTypeIssue>[] = [];
    const statusProperty = node.getProperty("status");
    const value = statusProperty?.ast.values?.values.at(0)?.value;
    if (value instanceof StringValue) {
      if (value.value === "disabled") {
        [...node.definitions, ...node.referencedBy].forEach((n) =>
          issue.push(
            genIssue(
              StandardTypeIssue.NODE_DISABLED,
              n,
              DiagnosticSeverity.Hint,
              [
                ...(statusProperty?.ast.parentNode
                  ? [statusProperty?.ast.parentNode]
                  : []),
              ],
              [DiagnosticTag.Unnecessary]
            )
          )
        );
        return issue;
      }
    }

    const propIssues = this.properties.flatMap((propType) => {
      if (typeof propType.name === "string") {
        const property = node.getProperty(propType.name);
        return propType.validateProperty(
          runtime,
          node,
          propType.name,
          property
        );
      }

      const properties = node.properties.filter((p) =>
        propType.getNameMatch(p.name)
      );

      const ddd = this.properties.filter((t) => t !== propType) ?? [];

      if (properties.filter((p) => ddd.some((d) => d.getNameMatch(p.name)))) {
        return [];
      }

      return properties.flatMap((p) =>
        propType.validateProperty(runtime, node, p.name, p)
      );
    });

    return [...issue, ...propIssues];
  }

  get properties() {
    return this._properties;
  }

  addProperty(property: PropertyNodeType | PropertyNodeType[]) {
    if (Array.isArray(property)) {
      property.forEach((p) => this._properties.push(p));
    } else {
      this._properties.push(property);
    }
    this._properties.sort((a) => {
      return typeof a.name === "string" ? 1 : 0;
    });
  }

  get childNodeType() {
    return this._childNodeType;
  }

  set childNodeType(nodeType: NodeType | undefined) {
    if (!nodeType) {
      return;
    }

    nodeType.bindingsPath = this.bindingsPath;
    this._childNodeType = nodeType;
  }

  getOnPropertyHover(name: string) {
    const typeFound = this.properties.find((p) => p.getNameMatch(name));
    return typeFound?.onHover.bind(typeFound)();
  }
}
