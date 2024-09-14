import { DtcChildNode, DtcRefNode, DtcRootNode } from '../ast/dtc/node';
import { ContextIssues, Issue, Searchable, SearchableResult } from '../types';
import { Property } from './property';
import { DeleteProperty } from '../ast/dtc/deleteProperty';
import { DeleteNode } from '../ast/dtc/deleteNode';
import { positionInBetween } from '../helpers';
import { DiagnosticSeverity, DiagnosticTag, Position } from 'vscode-languageserver';
import { LabelAssign } from '../ast/dtc/label';
import { ASTBase } from 'src/ast/base';
import { Node } from './node';

export class Runtime implements Searchable {
	public roots: DtcRootNode[] = [];
	public referances: DtcRefNode[] = [];
	public unlinkedDeletes: DeleteNode[] = [];
	public rootNode: Node = new Node('/');

	getDeepestAstNode(file: string, position: Position): SearchableResult {
		// return this.rootNode.getDeepestAstNode(file, position) ?? ;
		const inNode = [...this.roots, ...this.referances, ...this.unlinkedDeletes].find((i) =>
			positionInBetween(i, file, position)
		);

		let _node: Node | undefined;
		const getNode = () => {
			return _node ?? this.rootNode;
		};

		if (inNode instanceof DtcRefNode) {
			_node = this.rootNode.getReferenceBy(inNode);
		}

		if (inNode) {
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

	get issues(): Issue<ContextIssues>[] {
		return this.rootNode.issues;
	}

	get deletedPropertiesIssues(): Issue<ContextIssues>[] {
		return this.rootNode.deletedPropertiesIssues;
	}

	get deletedNodesIssues(): Issue<ContextIssues>[] {
		return this.rootNode.deletedNodesIssues;
	}
}
