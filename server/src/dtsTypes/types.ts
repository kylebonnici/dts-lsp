import { genIssue } from "../helpers";
import { type Node } from "../context/node";
import { Property } from "../context/property";
import { Issue, StandardTypeIssue } from "../types";
import { Runtime } from "../context/runtime";
import {
  CompletionItem,
  CompletionItemKind,
  DiagnosticSeverity,
} from "vscode-languageserver";
import { PropertyValue } from "../ast/dtc/values/value";
import { StringValue } from "../ast/dtc/values/string";
import { ASTBase } from "../ast/base";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { LabelRef } from "../ast/dtc/labelRef";
import { NodePathRef } from "../ast/dtc/values/nodePath";

export enum PropertyType {
  EMPTY,
  U32,
  U64,
  STRING,
  PROP_ENCODED_ARRAY,
  STRINGLIST,
  BYTESTRING,
  UNKNOWN,
}

export interface Validate {
  validate: (runtime: Runtime, node: Node) => Issue<StandardTypeIssue>[];
}

export type RequirementStatus = "required" | "omitted" | "optional";

export type TypeConfig = { types: PropertyType[] };
export class PropertyNodeType<T = string | number> implements Validate {
  public readonly required: (node: Node) => RequirementStatus;
  public readonly values: (property: Property) => T[];
  public hideAutoComplete = false;
  public list = false;

  constructor(
    public readonly name: string | ((n: string) => boolean),
    public readonly type: TypeConfig[],
    required:
      | RequirementStatus
      | ((node: Node) => RequirementStatus) = "optional",
    public readonly def: T | undefined = undefined,
    values: T[] | ((property: Property) => T[]) = [],
    public readonly additionalTypeCheck?: (
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

  private validateProperty(
    runtime: Runtime,
    node: Node,
    propertyName: string,
    property?: Property
  ): Issue<StandardTypeIssue>[] {
    const required = this.required(node);
    if (!property) {
      if (required === "required") {
        const orderdTree = runtime.getOrderedNodeAst(node);
        return [
          genIssue<StandardTypeIssue>(
            StandardTypeIssue.REQUIRED,
            orderdTree[0],
            DiagnosticSeverity.Error,
            orderdTree.slice(1),
            [],
            [propertyName]
          ),
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

    const propTypes = propertyValuesToPropetyType(property);
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
            // TODO Check
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
      } else if (this.list) {
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
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
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
          if (
            !this.values(property).some(
              (v) => !!currentValue.value.match(new RegExp(`^["']${v}["']$`))
            )
          ) {
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

  validate(runtime: Runtime, node: Node): Issue<StandardTypeIssue>[] {
    if (typeof this.name === "string") {
      const property = node.getProperty(this.name);
      return this.validateProperty(runtime, node, this.name, property);
    }

    const properties = node.properties.filter((p) => this.getNameMatch(p.name));
    return properties.flatMap((p) =>
      this.validateProperty(runtime, node, p.name, p)
    );
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

const propertyValuesToPropetyType = (property: Property): PropertyType[] => {
  return property.ast.values
    ? property.ast.values.values.map((v) => propertyValueToPropetyType(v))
    : [PropertyType.EMPTY];
};

const propertyValueToPropetyType = (
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
    return PropertyType.U32; // TODO Check this
  }

  return PropertyType.BYTESTRING;
};

export class NodeType {
  compatible?: string;
  properties: PropertyNodeType[] = [];
  childNodeTypes: NodeType[] = [];

  constructor(private node: Node) {}

  getIssue(runtime: Runtime) {
    return this.properties.flatMap((p) => p.validate(runtime, this.node));
  }
}
