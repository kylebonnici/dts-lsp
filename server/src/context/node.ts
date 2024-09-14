import { DtcChildNode, DtcRefNode, DtcRootNode } from '../ast/dtc/node';
import { ContextIssues, Issue, Searchable, SearchableResult } from '../types';
import { Property } from './property';
import { DeleteProperty } from '../ast/dtc/deleteProperty';
import { DeleteNode } from '../ast/dtc/deleteNode';
import { positionInBetween } from '../helpers';
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
import { LabelAssign } from '../ast/dtc/label';
import { ASTBase } from 'src/ast/base';

export class Node implements Searchable {
	public referancesBy: DtcRefNode[] = [];
	public definitons: DtcChildNode[] = [];
	private _properties: Property[] = [];
	private _deletedProperties: { property: Property; by: DeleteProperty }[] = [];
	private _deletedNodes: { node: Node; by: DeleteNode }[] = [];
	private _nodes: Node[] = [];

	constructor(public readonly name: string, public readonly parent: Node | null = null) {
		parent?.addNode(this);
	}

	public getReferenceBy(node: DtcRefNode): Node | undefined {
		if (this.referancesBy.some((n) => n === node)) {
			return this;
		}

		return [...this._nodes, ...this._deletedNodes.map((n) => n.node)]
			.map((n) => n.getReferenceBy(node))
			.find((n) => n);
	}

	getDeepestAstNode(file: string, position: Position): SearchableResult {
		const inNode = this.definitons.find((i) => positionInBetween(i, file, position));

		let _node: Node | undefined;
		const getNode = () => {
			return _node ?? this;
		};

		if (inNode instanceof DtcRefNode) {
			_node = this.getReferenceBy(inNode);
		}

		if (inNode) {
			const inProperty = [
				...getNode()._properties.flatMap((p) => [p, ...p.allReplaced]),
				...getNode()._deletedProperties.map((d) => d.property),
			]
				.map((p) => ({
					item: p,
					ast: p.ast,
				}))
				.find((i) => positionInBetween(i.ast, file, position));

			if (inProperty) {
				return inProperty.item.getDeepestAstNode(file, position);
			}

			const inChildNode = [
				...getNode()._nodes,
				...getNode()._deletedNodes.map((d) => d.node),
			]
				.map((n) => n.getDeepestAstNode(file, position))
				.find((i) => i);

			if (inChildNode) {
				return inChildNode;
			}

			let deepestAstNode: ASTBase | undefined = inNode;
			let next: ASTBase | undefined = inNode;
			while (next) {
				deepestAstNode = next;
				next = deepestAstNode.children
					.reverse()
					.find((c) => positionInBetween(c, file, position));
			}

			return {
				item: getNode(),
				ast: deepestAstNode,
			};
		}

		return;
	}

	get labels(): LabelAssign[] {
		return [
			...this.referancesBy.flatMap((r) => r.labels),
			...this.definitons.flatMap((def) => def.labels),
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
			...[...meta.node.definitons, ...meta.node.referancesBy].flatMap((node) => ({
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
		}
	}

	getChild(path: string[]): Node | undefined {
		if (path.length === 1 && path[0] === this.name) return this;
		if (path[0] !== this.name) return undefined;
		path.splice(0, 1);
		const myChild = this._nodes.find((node) => node.name === path[0]);
		return myChild?.getChild(path);
	}
}
