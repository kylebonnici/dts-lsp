/* eslint-disable no-mixed-spaces-and-tabs */
import { DtcProperty } from '../ast/dtc/property';
import { ContextIssues, Issue, Searchable, SearchableResult } from '../types';
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
import { getDeepestAstNodeInBetween, positionInBetween } from '../helpers';
import { LabelAssign } from '../ast/dtc/label';
import { LabelRefValue } from '../ast/dtc/values/labelRef';
import { LabelRef } from '../ast/dtc/labelRef';
import { AllValueType, LabelValue } from '../ast/dtc/types';
import { NodePathValue } from '../ast/dtc/values/nodePath';
import { type Node } from './node';

export class Property {
	replaces?: Property;
	constructor(public readonly ast: DtcProperty, public readonly parent: Node) {}

	getDeepestAstNode(file: string, position: Position): Omit<SearchableResult, 'runtime'> {
		return {
			item: this,
			ast: getDeepestAstNodeInBetween(this.ast, file, position),
		};
	}

	get name() {
		return this.ast.propertyName?.name ?? '[UNSET]';
	}

	get labels(): LabelAssign[] {
		return this.ast.allDescendants.filter((c) => c instanceof LabelAssign) as LabelAssign[];
	}

	get nodeRefValues(): LabelValue[] {
		const values = this.ast.values?.values
			.filter((v) => v)
			.flatMap((v) => v?.value)
			.filter((v) => v) as AllValueType[] | undefined;
		if (!values) return [];

		const result = [
			...((values.filter((c) => c instanceof LabelRef && c.value) as LabelRef[]).map(
				(r) => ({ ast: r, label: r.value })
			) as LabelValue[]),
			...((
				values.filter(
					(c) => c instanceof LabelRefValue && c.value?.value
				) as LabelRefValue[]
			).map((r) => ({ ast: r, label: r.value?.value })) as LabelValue[]),
		];

		return result;
	}

	get nodePathRefValues(): NodePathValue[] {
		const values = this.ast.values?.values
			.filter((v) => v)
			.flatMap((v) => v?.value)
			.filter((v) => v) as AllValueType[] | undefined;
		if (!values) return [];

		const result = values.filter(
			(c) => c instanceof NodePathValue && c.path
		) as NodePathValue[];

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
