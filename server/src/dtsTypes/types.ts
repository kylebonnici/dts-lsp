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
import { DtcProperty } from "../ast/dtc/property";
import { LabelRef } from "../ast/dtc/labelRef";
import { NodePathRef } from "../ast/dtc/values/nodePath";
import { PropertyValues } from "../ast/dtc/values/values";

export enum PropetyType {
  EMPTY,
  U32,
  U64,
  U32_U64,
  STRING,
  PROP_ENCODED_ARRAY,
  STRINGLIST,
  BYTESTRING,
  UNKNOWN,
}

export interface Validate {
  validate: (runtime: Runtime, node: Node) => Issue<StandardTypeIssue>[];
}

export type TypeConfig = { types: PropetyType[] };
export class PropertyNodeType<T = string | number> implements Validate {
  constructor(
    public readonly name: string,
    public readonly type: TypeConfig[],
    public readonly required = false,
    public readonly def: T | undefined = undefined,
    public readonly values: T[] = [],
    public readonly additionalTypeCheck?: (
      values: PropertyValues
    ) => StandardTypeIssue[]
  ) {}

  validate(runtime: Runtime, node: Node): Issue<StandardTypeIssue>[] {
    const property = node.getProperty(this.name);

    if (!property) {
      if (this.required) {
        const orderdTree = runtime.getOrderedNodeAst(node);
        return [
          genIssue<StandardTypeIssue>(
            StandardTypeIssue.REQUIRED,
            orderdTree[0],
            DiagnosticSeverity.Error,
            orderdTree.slice(1),
            [],
            [this.name]
          ),
        ];
      }

      return [];
    }

    const propTypes = propertyValuesToPropetyType(property);
    const issues: Issue<StandardTypeIssue>[] = [];

    const checkType = (
      expected: PropetyType[],
      type: PropetyType,
      ast: ASTBase | undefined | null
    ) => {
      ast ??= property.ast;

      const typeIsValid =
        expected.some((tt) => tt == type) ||
        (expected.some((tt) => tt == PropetyType.U32_U64) &&
          (type === PropetyType.U32 || type === PropetyType.U64)) ||
        (expected.some((tt) => tt == PropetyType.STRINGLIST) &&
          (type === PropetyType.STRING || type === PropetyType.STRINGLIST)) ||
        (expected.some((tt) => tt == PropetyType.PROP_ENCODED_ARRAY) &&
          (type === PropetyType.U32 || type === PropetyType.U64));

      const issue: StandardTypeIssue[] = [];
      if (typeIsValid && property.ast.values) {
        issue.push(...(this.additionalTypeCheck?.(property.ast.values) ?? []));
      }

      if (!typeIsValid) {
        expected.forEach((tt) => {
          switch (tt) {
            case PropetyType.EMPTY:
              issue.push(StandardTypeIssue.EXPECTED_EMPTY);
              break;
            case PropetyType.STRING:
              issue.push(StandardTypeIssue.EXPECTED_STRING);
              break;
            case PropetyType.STRINGLIST:
              issue.push(StandardTypeIssue.EXPECTED_STRINGLIST);
              break;
            case PropetyType.U32:
              issue.push(StandardTypeIssue.EXPECTED_U32);
              break;
            case PropetyType.U64:
              issue.push(StandardTypeIssue.EXPECTED_U64);
              break;
            case PropetyType.U32_U64:
              issue.push(StandardTypeIssue.EXPECTED_U32_U64);
              break;
            case PropetyType.PROP_ENCODED_ARRAY:
              issue.push(StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY);
              break;
          }
        });
      }

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
    };

    if (this.type.length > 1) {
      const type = this.type;
      if (this.type.length !== propTypes.length) {
        issues.push(
          genIssue(
            StandardTypeIssue.EXPECTED_COMPOSITE_LENGTH,
            property.ast.values ?? property.ast,
            DiagnosticSeverity.Error,
            [],
            [],
            [this.name, this.type.length.toString()]
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
      if (this.type[0].types.some((tt) => tt === PropetyType.STRINGLIST)) {
        propTypes.some((t) =>
          checkType(
            [PropetyType.STRINGLIST],
            t,
            property.ast.values?.values[0]?.value
          )
        );
      } else if (
        propTypes.length > 1 &&
        this.type[0].types.some((tt) => tt !== PropetyType.EMPTY)
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
      if (
        issues.length === 0 &&
        this.values.length &&
        this.type[0].types.some((tt) => tt === PropetyType.STRING)
      ) {
        const currentValue = property.ast.values?.values[0]
          ?.value as StringValue;
        if (
          !this.values.some(
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
              [this.values.map((v) => `'${v}'`).join(" or ")]
            )
          );
        }
      }
    }

    return issues;
  }

  getPropertyCompletionItems(property: DtcProperty): CompletionItem[] {
    if (this.type.at(0)?.types.some((tt) => tt === PropetyType.STRING)) {
      if (property.values?.values && property.values.values?.length > 1) {
        return [];
      }

      return this.values.map((v) => ({
        label: `"${v}"`,
        kind: CompletionItemKind.Variable,
        sortText: v === this.def ? `A${v}` : `Z${v}`,
      }));
    }

    return [];
  }
}

const propertyValuesToPropetyType = (property: Property): PropetyType[] => {
  return property.ast.values
    ? property.ast.values.values.map((v) => propertyValueToPropetyType(v))
    : [PropetyType.EMPTY];
};

const propertyValueToPropetyType = (
  value: PropertyValue | null
): PropetyType => {
  if (!value) {
    return PropetyType.UNKNOWN;
  }
  if (value.value instanceof StringValue) {
    return PropetyType.STRING;
  }

  if (value.value instanceof ArrayValues) {
    if (value.value.values.length === 1) {
      return PropetyType.U32;
    } else if (value.value.values.length === 2) {
      return PropetyType.U64;
    } else {
      return PropetyType.PROP_ENCODED_ARRAY;
    }
  }

  if (value.value instanceof LabelRef || value.value instanceof NodePathRef) {
    return PropetyType.U32; // TODO Check this
  }

  return PropetyType.BYTESTRING;
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
