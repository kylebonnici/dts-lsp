import { Location, TextDocumentPositionParams } from 'vscode-languageserver';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { DtcChildNode, DtcRefNode, NodeName } from './ast/dtc/node';
import { DeleteNode } from './ast/dtc/deleteNode';
import { Label, LabelAssign } from './ast/dtc/label';
import { LabelRef } from './ast/dtc/labelRef';
import { nodeFinder, toRange } from './helpers';
import { DtcProperty, PropertyName } from './ast/dtc/property';
import { Property } from './context/property';
import { DeleteProperty } from './ast/dtc/deleteProperty';

function getPropertyReferances(result: SearchableResult | undefined): Location[] {
	if (!result || result.item === null || !(result.ast instanceof PropertyName)) {
		return [];
	}

	const getTopProperty = (property: Property): Property => {
		if (property.replacedBy) {
			return getTopProperty(property.replacedBy);
		}

		return property;
	};

	const gentItem = (property: Property) => {
		return [
			property.ast,
			...property.allReplaced.map((p) => p.ast),
			...[property.parent.deletedProperties.find((p) => (p.property = property))?.by ?? []],
		]
			.map((dtc) => {
				if (dtc instanceof DtcProperty) {
					return Location.create(`file://${dtc.uri}`, toRange(dtc.propertyName ?? dtc));
				}
				if (dtc instanceof DeleteProperty) {
					return Location.create(`file://${dtc.uri}`, toRange(dtc.propertyName ?? dtc));
				}
			})
			.filter((r) => r) as Location[];
	};

	if (result.item instanceof Property && result.ast instanceof PropertyName) {
		return gentItem(getTopProperty(result.item));
	}

	if (
		result.item instanceof Node &&
		result.ast instanceof PropertyName &&
		result.ast.parentNode instanceof DeleteProperty
	) {
		const property = result.item.deletedProperties.find(
			(d) => d.by === result.ast.parentNode
		)?.property;
		if (property) return gentItem(property);
	}

	return [];
}

function getNodeReferances(result: SearchableResult | undefined): Location[] {
	if (
		!result ||
		(!(result.ast instanceof NodeName) &&
			!(result.ast instanceof LabelAssign) &&
			!(result.ast instanceof Label))
	) {
		return [];
	}

	const gentItem = (node: Node) => {
		return [...node.linkedRefLabels, ...node.linkedNodeNamePaths, ...node.definitons]
			.map((dtc) => {
				if (dtc instanceof DtcChildNode) {
					return Location.create(`file://${dtc.uri}`, toRange(dtc.name ?? dtc));
				}
				if (dtc instanceof NodeName) {
					return Location.create(`file://${dtc.uri}`, toRange(dtc));
				}
				if (dtc instanceof LabelRef) {
					return Location.create(`file://${dtc.uri}`, toRange(dtc.label ?? dtc));
				}
			})
			.filter((r) => r) as Location[];
	};
	if (result.item instanceof Node) {
		return gentItem(result.item);
	}

	if (result.ast instanceof Label && result.ast.parentNode instanceof LabelRef) {
		if (result.ast.parentNode.linksTo) {
			return gentItem(result.ast.parentNode.linksTo);
		}
	}

	if (result.ast instanceof NodeName) {
		if (result.ast.linksTo) {
			return gentItem(result.ast.linksTo);
		}
	}

	return [];
}

export async function getReferences(
	location: TextDocumentPositionParams,
	context: ContextAware
): Promise<Location[]> {
	return nodeFinder(location, context, (locationMeta) => [
		...getNodeReferances(locationMeta),
		...getPropertyReferances(locationMeta),
	]);
}
