import { DtcChildNode, DtcRefNode, DtcRootNode, NodeName } from '../ast/dtc/node';
import { ContextIssues, Issue, Searchable, SearchableResult } from '../types';
import { Property } from './property';
import { DeleteProperty } from '../ast/dtc/deleteProperty';
import { DeleteNode } from '../ast/dtc/deleteNode';
import { getDeepestAstNodeInBetween, positionInBetween } from '../helpers';
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
import { LabelAssign } from '../ast/dtc/label';
import { LabelValue } from '../ast/dtc/types';
import { ASTBase } from '../ast/base';
import { getStandardType } from '../dtsTypes/standrdTypes';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { DeleteBase } from '../ast/dtc/delete';
import { LabelRef } from '../ast/dtc/labelRef';

export class Node {
	public referancedBy: DtcRefNode[] = [];
	public definitons: (DtcChildNode | DtcRootNode)[] = [];
	private _properties: Property[] = [];
	private _deletedProperties: { property: Property; by: DeleteProperty }[] = [];
	private _deletedNodes: { node: Node; by: DeleteNode }[] = [];
	public deletes: DeleteBase[] = [];
	private _nodes: Node[] = [];
	linkedNodeNamePaths: NodeName[] = [];
	linkedRefLabels: LabelRef[] = [];

	public nodeType = getStandardType(this);

	constructor(public readonly name: string, public readonly parent: Node | null = null) {
		parent?.addNode(this);
	}

	public getReferenceBy(node: DtcRefNode): Node | undefined {
		if (this.referancedBy.some((n) => n === node)) {
			return this;
		}

		return [...this._nodes, ...this._deletedNodes.map((n) => n.node)]
			.map((n) => n.getReferenceBy(node))
			.find((n) => n);
	}

	getDeepestAstNode(
		previousFiles: string[],
		file: string,
		position: Position
	): Omit<SearchableResult, 'runtime'> | undefined {
		const inNode = [...this.definitons, ...this.referancedBy].find((i) =>
			positionInBetween(i, file, position)
		);

		if (inNode) {
			const inDeletes = this.deletes
				.map((p) => ({
					item: this,
					ast: getDeepestAstNodeInBetween(p, previousFiles, file, position),
				}))
				.find((i) => positionInBetween(i.ast, file, position));

			if (inDeletes) {
				return inDeletes;
			}

			const inProperty = [
				...this._properties.flatMap((p) => [p, ...p.allReplaced]),
				...this._deletedProperties.flatMap((d) => [d.property, ...d.property.allReplaced]),
			]
				.map((p) => ({
					item: p,
					ast: p.ast,
				}))
				.find((i) => positionInBetween(i.ast, file, position));

			if (inProperty) {
				return inProperty.item.getDeepestAstNode(previousFiles, file, position);
			}

			const inChildNode = [...this._nodes, ...this._deletedNodes.map((d) => d.node)]
				.map((n) => n.getDeepestAstNode(previousFiles, file, position))
				.find((i) => i);

			if (inChildNode) {
				return inChildNode;
			}

			const deepestAstNode = getDeepestAstNodeInBetween(
				inNode,
				previousFiles,
				file,
				position
			);

			return {
				item: this,
				ast: deepestAstNode,
			};
		}

		return;
	}

	get nodeRefValues(): LabelValue[] {
		return [
			...this.properties.flatMap((p) => p.nodeRefValues),
			...this.nodes.flatMap((n) => n.nodeRefValues),
		];
	}

	get nodePathRefValues(): NodePathRef[] {
		return [
			...this.properties.flatMap((p) => p.nodePathRefValues),
			...this.nodes.flatMap((n) => n.nodePathRefValues),
		];
	}

	get labels(): LabelAssign[] {
		return [
			...this.referancedBy.flatMap((r) => r.labels),
			...(
				this.definitons.filter((def) => def instanceof DtcChildNode) as DtcChildNode[]
			).flatMap((def) => def.labels),
		];
	}

	get labelsMapped() {
		return this.labels.map((l) => ({
			label: l,
			owner: this,
		}));
	}

	get allDescendantsLabels(): LabelAssign[] {
		return [
			...this.labels,
			...this.properties.flatMap((p) => p.labels),
			...this._nodes.flatMap((n) => n.allDescendantsLabels),
		];
	}

	get allDescendantsLabelsMapped(): {
		label: LabelAssign;
		owner: Property | Node | null;
	}[] {
		return [
			...this.labelsMapped,
			...this.properties.flatMap((p) => p.labelsMapped),
			...this._nodes.flatMap((n) => n.allDescendantsLabelsMapped),
		];
	}

	get issues(): Issue<ContextIssues>[] {
		return [
			...this.properties.flatMap((p) => p.issues),
			...this._nodes.flatMap((n) => n.issues),
			...this._deletedNodes.flatMap((n) => n.node.issues),
			...this.deletedPropertiesIssues,
			...this.deletedNodesIssues,
		];
	}

	get deletedPropertiesIssues(): Issue<ContextIssues>[] {
		return [
			...this._deletedProperties.flatMap((meta) => [
				{
					issues: [ContextIssues.DELETE_PROPERTY],
					severity: DiagnosticSeverity.Hint,
					astElement: meta.property.ast,
					linkedTo: [meta.by],
					tags: [DiagnosticTag.Deprecated],
					templateStrings: [meta.property.name],
				},
				...meta.property.issues,
			]),
		];
	}

	get deletedNodesIssues(): Issue<ContextIssues>[] {
		return this._deletedNodes.flatMap((meta) => [
			...[
				...(meta.node.definitons.filter(
					(node) => node instanceof DtcChildNode
				) as DtcChildNode[]),
				...meta.node.referancedBy,
			].flatMap((node) => ({
				issues: [ContextIssues.DELETE_NODE],
				severity: DiagnosticSeverity.Hint,
				astElement: node,
				linkedTo: [meta.by],
				tags: [DiagnosticTag.Deprecated],
				templateStrings: [
					node instanceof DtcChildNode
						? node.name!.name
						: node.labelReferance!.label!.value,
				],
			})),
		]);
	}

	get path(): string[] {
		return this.parent ? [...this.parent.path, this.name] : [this.name];
	}

	get properties() {
		return this._properties;
	}

	get deletedProperties() {
		return this._deletedProperties;
	}

	get nodes() {
		return this._nodes;
	}

	get deletedNodes() {
		return this._deletedNodes;
	}

	get propertyNames() {
		return this._properties.map((property) => property.name);
	}

	hasNode(name: string) {
		return this._nodes.some((node) => node.name === name);
	}

	hasProperty(name: string) {
		return this._properties.some((property) => property.name === name);
	}

	getProperty(name: string) {
		return this._properties.find((property) => property.name === name);
	}

	deleteNode(name: string, by: DeleteNode) {
		const index = this._nodes.findIndex((node) => node.name === name);
		if (index === -1) return;

		this._deletedNodes.push({
			node: this._nodes[index],
			by,
		});

		this._nodes.splice(index, 1);
	}

	getNode(name: string) {
		const index = this._nodes.findIndex((node) => node.name === name);
		if (index === -1) return;

		return this._nodes[index];
	}

	deleteProperty(name: string, by: DeleteProperty) {
		const index = this._properties.findIndex((property) => property.name === name);
		if (index === -1) return;

		this._deletedProperties.push({
			property: this._properties[index],
			by,
		});

		this._properties.splice(index, 1);
	}

	addNode(node: Node) {
		this._nodes.push(node);
	}

	addProperty(property: Property) {
		const index = this._properties.findIndex((p) => p.name === property.name);
		if (index === -1) {
			this._properties.push(property);
		} else {
			const replaced = this._properties.splice(index, 1)[0];
			this._properties.push(property);
			property.replaces = replaced;
			replaced.replacedBy = property;
		}
	}

	getChild(path: string[]): Node | undefined {
		if (path.length === 1 && path[0] === this.name) return this;
		if (path[0] !== this.name) return undefined;
		const copy = [...path];
		copy.splice(0, 1);
		const myChild = this._nodes.find((node) => node.name === copy[0]);
		return myChild?.getChild(copy);
	}

	getChildFromScope(path: string[], inScope: (ast: ASTBase) => boolean): Node | undefined {
		if (path.length === 1 && path[0] === this.name) return this;
		if (path[0] !== this.name) return undefined;
		const copy = [...path];
		copy.splice(0, 1);
		const myChild = [
			...this._nodes,
			...this._deletedNodes.filter((n) => !inScope(n.by)).map((n) => n.node),
		].find((node) => node.name === copy[0]);
		return myChild?.getChildFromScope(copy, inScope);
	}
}
