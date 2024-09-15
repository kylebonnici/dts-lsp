import { genIssue } from '../helpers';
import { type Node } from '../context/node';
import { Property } from '../context/property';
import { Issue, StandardTypeIssue } from '../types';
import { Runtime } from '../context/runtime';
import {
	CompletionItem,
	CompletionItemKind,
	DiagnosticSeverity,
} from 'vscode-languageserver';
import { PropertyValue } from '../ast/dtc/values/value';
import { StringValue } from '../ast/dtc/values/string';
import { NumberValues } from '../ast/dtc/values/number';
import { LabelRef } from '../ast/dtc/labelRef';
import { NodePathValue } from '../ast/dtc/values/nodePath';
import { LabelRefValue } from '../ast/dtc/values/labelRef';
import { ASTBase } from '../ast/base';

export enum PropetyType {
	EMPTY,
	U32,
	U64,
	U32_U64,
	STRING,
	PROP_ENCODED_ARRAY,
	PHANDEL,
	STRINGLIST,
	BYTESTRING,
	UNKNOWN,
}

export interface Validate {
	validate: (runtime: Runtime, node: Node) => Issue<StandardTypeIssue>[];
}

export class PropertyNodeType<T = string | number> implements Validate {
	constructor(
		public readonly name: string,
		public readonly type: PropetyType | PropetyType[],
		public readonly required = false,
		public readonly def: T | undefined = undefined,
		public readonly values: T[] = []
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
			expected: PropetyType,
			type: PropetyType,
			ast: ASTBase | undefined | null
		) => {
			ast ??= property.ast;

			const typeIsValid =
				expected === type ||
				(expected === PropetyType.U32_U64 &&
					(type === PropetyType.U32 || type === PropetyType.U64));

			if (!typeIsValid) {
				let issue: StandardTypeIssue | undefined;
				switch (expected) {
					case PropetyType.EMPTY:
						issue = StandardTypeIssue.EXPECTED_EMPTY;
						break;
					case PropetyType.STRING:
						issue = StandardTypeIssue.EXPECTED_STRING;
						break;
					case PropetyType.U32:
						issue = StandardTypeIssue.EXPECTED_U32;
						break;
					case PropetyType.U64:
						issue = StandardTypeIssue.EXPECTED_U64;
						break;
					case PropetyType.U32_U64:
						issue = StandardTypeIssue.EXPECTED_U32_U64;
						break;
					case PropetyType.PHANDEL:
						issue = StandardTypeIssue.EXPECTED_PHANDEL;
						break;
				}

				if (issue) {
					issues.push(
						genIssue(issue, ast, DiagnosticSeverity.Error, [], [], [property.name])
					);
				}
			}
		};

		if (Array.isArray(this.type)) {
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
					if (type[i] !== t) {
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
			if (this.type === PropetyType.STRINGLIST) {
				propTypes.some((t, i) =>
					checkType(PropetyType.STRING, t, property.ast.values?.values[0]?.value)
				);
			} else if (propTypes.length > 1 && this.type !== PropetyType.EMPTY) {
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
				checkType(this.type, propTypes[0], property.ast.values?.values[0]?.value);
			}
			// we have the right type
			if (issues.length === 0 && this.values.length && this.type === PropetyType.STRING) {
				const currentValue = property.ast.values?.values[0]?.value as StringValue;
				if (
					!this.values.some((v) => !!currentValue.value.match(new RegExp(`^["']${v}["']$`)))
				) {
					issues.push(
						genIssue(
							StandardTypeIssue.EXPECTED_ENUM,
							property.ast.values?.values[0]?.value ?? property.ast,
							DiagnosticSeverity.Error,
							[],
							[],
							[this.values.map((v) => `'${v}'`).join(' or ')]
						)
					);
				}
			}
		}

		return issues;
	}

	completionItems(): CompletionItem[] {
		if (this.type === PropetyType.STRING) {
			return this.values.map((v) => ({
				label: ` "${v}"`,
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

const propertyValueToPropetyType = (value: PropertyValue | null): PropetyType => {
	if (!value) {
		return PropetyType.UNKNOWN;
	}
	if (value.value instanceof StringValue) {
		return PropetyType.STRING;
	}

	if (value.value instanceof NumberValues) {
		if (value.value.values.length === 0 || value.value.values.length === 1) {
			return PropetyType.U32;
		} else if (value.value.values.length === 2) {
			return PropetyType.U64;
		} else {
			return PropetyType.PROP_ENCODED_ARRAY;
		}
	}
	if (
		value.value instanceof LabelRef ||
		value.value instanceof NodePathValue ||
		value.value instanceof LabelRefValue
	) {
		return PropetyType.PHANDEL;
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
