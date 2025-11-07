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

import {
	DiagnosticSeverity,
	DiagnosticTag,
	MarkupContent,
	MarkupKind,
	Position,
} from 'vscode-languageserver';
import {
	ContextIssues,
	FileDiagnostic,
	MacroRegistryItem,
	NexusMapEntry,
	SearchableResult,
} from '../types';
import { DtcProperty } from '../ast/dtc/property';
import {
	genContextDiagnostic,
	getDeepestAstNodeAfter,
	getDeepestAstNodeBefore,
	getDeepestAstNodeInBetween,
	positionAfter,
	toRange,
} from '../helpers';
import type { ASTBase } from '../ast/base';
import { LabelAssign } from '../ast/dtc/label';
import { NumberValue } from '../ast/dtc/values/number';
import { Expression } from '../ast/cPreprocessors/expression';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { LabelRef } from '../ast/dtc/labelRef';
import type { SerializableProperty, SerializedNexusMap } from '../types/index';
import type { Node } from './node';

export interface NexusMapping {
	mappingValuesAst: (LabelRef | NodePathRef | NumberValue | Expression)[];
	specifierSpace?: string;
	target: Node;
	cellCount: number;
	mapItem?: NexusMapEntry;
}
export class Property {
	replaces?: Property;
	replacedBy?: Property;
	nexusMapsTo: NexusMapping[] = [];
	constructor(
		public readonly ast: DtcProperty,
		public readonly parent: Node,
	) {}

	getDeepestAstNode(
		file: string,
		position: Position,
	): Omit<SearchableResult, 'runtime'> {
		const deepestAstNode = getDeepestAstNodeInBetween(
			this.ast,
			file,
			position,
		);

		if (this.ast.assignOperatorToken) {
			if (positionAfter(this.ast.assignOperatorToken, file, position)) {
				return {
					item: this,
					ast: deepestAstNode,
					beforeAst: getDeepestAstNodeBefore(
						this.ast,
						file,
						position,
					),
					afterAst: getDeepestAstNodeAfter(this.ast, file, position),
				};
			}
		}

		return {
			item: this,
			ast: deepestAstNode,
		};
	}

	get name() {
		return this.ast.propertyName?.name ?? '[UNSET]';
	}

	get labels(): LabelAssign[] {
		return this.ast.allDescendants.filter(
			(c) => c instanceof LabelAssign,
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

	getArgumentIndex(ast: ASTBase | undefined) {
		if (!ast) return;
		const index = this.ast
			.getFlatAstValues()
			?.findIndex((item) => item === ast || item?.isAncestorOf(ast));

		return index === -1 ? undefined : index;
	}

	get issues(): FileDiagnostic[] {
		return this.replacedIssues;
	}

	get replacedIssues(): FileDiagnostic[] {
		return [
			...(this.replaces?.replacedIssues ?? []),
			...(this.replaces
				? [
						genContextDiagnostic(
							ContextIssues.DUPLICATE_PROPERTY_NAME,
							this.replaces.ast.firstToken,
							this.replaces.ast.lastToken,
							this.replaces.ast,
							{
								severity: DiagnosticSeverity.Hint,
								linkedTo: [this.ast],
								tags: [DiagnosticTag.Unnecessary],
								templateStrings: [this.name],
							},
						),
					]
				: []),
		];
	}

	onHover(): MarkupContent | undefined {
		if (!this.nexusMapsTo.length) return;

		return {
			kind: MarkupKind.Markdown,
			value: [
				'### Nexus mappings',

				...this.nexusMapsTo
					.filter((m) => !!m.mapItem)
					.flatMap((m) => [
						'```',
						`${this.name} = <... ${m.mappingValuesAst
							.map((a) => a.toString())
							.join(' ')} ...> maps to <... ${m
							.mapItem!.mappingValues.map((a) => a.toString())
							.join(' ')} ...>;`,
						'```',
						`[Mapping (${m.mappingValuesAst
							.map((a) => a.toString())
							.join(
								' ',
							)})](${`${m.mapItem!.mappingValues[0].uri}#L${
							m.mapItem!.mappingValues[0].firstToken.pos.line + 1
						}`})`,
					]),
			].join('\n'),
		};
	}

	get allReplaced(): Property[] {
		return this.replaces
			? [this.replaces, ...this.replaces.allReplaced]
			: [];
	}

	toString() {
		return this.ast.toString();
	}

	toPrettyString(macros: Map<string, MacroRegistryItem>, level?: number) {
		return this.ast.toPrettyString(macros, level);
	}

	serialize(
		macros: Map<string, MacroRegistryItem>,
		inScope: (ast: ASTBase) => boolean,
	): SerializableProperty {
		const p =
			[this, ...this.allReplaced].find((p) => inScope(p.ast)) ?? this;
		return {
			...p.ast.serialize(macros),
			nodePath: this.parent.pathString,
			replaces: p.allReplaced.map((r) => ({
				range: toRange(r.ast),
				uri: r.ast.serializeUri,
			})),
			nexusMapEntry: p.nexusMapsTo.map((nexus) => {
				return {
					mappingValuesAst: nexus.mappingValuesAst.map((v) =>
						v.serialize(macros),
					),
					cellCount: nexus.cellCount,
					specifierSpace: nexus.specifierSpace,
					target: nexus.target.pathString,
					mapItem: nexus.mapItem
						? ({
								childCellCount: nexus.mapItem.childCellCount,
								mappingValues: nexus.mapItem.mappingValues.map(
									(v) => v.serialize(macros),
								),
								target: nexus.mapItem.node?.pathString,
								targetAst:
									nexus.mapItem.nodeAst?.serialize(macros),
								parentCellCount: nexus.mapItem.parentCellCount,
								parentValues: nexus.mapItem.parentValues?.map(
									(v) => v.serialize(macros),
								),
								specifierSpace:
									nexus.specifierSpace ?? 'interrupt',
							} satisfies SerializedNexusMap)
						: undefined,
				};
			}),
		};
	}
}
