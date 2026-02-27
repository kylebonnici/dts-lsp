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

import { Location, TextDocumentPositionParams } from 'vscode-languageserver';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Node } from './context/node';
import { NodeName } from './ast/dtc/node';
import { Label } from './ast/dtc/label';
import { LabelRef } from './ast/dtc/labelRef';
import {
	convertVirtualFsPathToDocumentFsPath,
	nodeFinder,
	pathToFileURI,
	toRange,
} from './helpers';
import { PropertyName } from './ast/dtc/property';
import { Property } from './context/property';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { isDeleteChild } from './ast/helpers';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { StringValue } from './ast/dtc/values/string';
import { CMacroCallParam } from './ast/cPreprocessors/functionCall';

export const generateDefinitionsFromNode = (node: Node) => {
	return node.implementations
		.map((dtc) => {
			const virtualDoc = convertVirtualFsPathToDocumentFsPath(dtc.fsPath);
			if (virtualDoc) {
				return Location.create(
					pathToFileURI(virtualDoc.docFsPath),
					virtualDoc.range,
				);
			}

			return Location.create(pathToFileURI(dtc.fsPath), toRange(dtc));
		})
		.filter((r) => r) as Location[];
};

const getTopProperty = (property: Property): Property => {
	if (property.replacedBy) {
		return getTopProperty(property.replacedBy);
	}

	return property;
};

export const generatePropertyDefinition = (property: Property): Location[] => {
	return [property.ast, ...property.allReplaced.map((p) => p.ast)]
		.map((dtc) => {
			const virtualDoc = convertVirtualFsPathToDocumentFsPath(dtc.fsPath);
			if (virtualDoc) {
				return Location.create(
					pathToFileURI(virtualDoc.docFsPath),
					virtualDoc.range,
				);
			}
			return Location.create(
				pathToFileURI(dtc.fsPath),
				toRange(dtc.propertyName ?? dtc),
			);
		})
		.filter((r) => r) as Location[];
};

function getPropertyDefinition(
	result: SearchableResult | undefined,
): Location[] {
	if (
		!result ||
		result.item === null ||
		!(result.ast instanceof PropertyName)
	) {
		return [];
	}

	if (result.item instanceof Property && result.ast instanceof PropertyName) {
		return generatePropertyDefinition(getTopProperty(result.item));
	}

	if (
		result.item instanceof Node &&
		result.ast instanceof PropertyName &&
		result.ast.parentNode instanceof DeleteProperty
	) {
		const property = result.item.deletedProperties.find(
			(d) => d.by === result.ast.parentNode,
		)?.property;
		if (property) return generatePropertyDefinition(property);
	}

	return [];
}

function getNodeDefinition(result: SearchableResult | undefined): Location[] {
	if (!result) {
		return [];
	}

	if (result.item instanceof Node && !isDeleteChild(result.ast)) {
		return generateDefinitionsFromNode(result.item);
	}

	if (
		result.ast instanceof Label &&
		result.ast.parentNode instanceof LabelRef
	) {
		if (result.ast.parentNode.linksTo) {
			return generateDefinitionsFromNode(result.ast.parentNode.linksTo);
		}
	}

	if (result.ast instanceof NodeName) {
		if (result.ast.linksTo) {
			return generateDefinitionsFromNode(result.ast.linksTo);
		}
	}

	if (
		result?.ast instanceof StringValue &&
		result.item instanceof Property &&
		result.item.parent.name === 'aliases'
	) {
		const node = result.runtime.rootNode.getChild(
			result.ast.value.split('/'),
		);
		if (node) {
			return generateDefinitionsFromNode(node);
		}
	}

	return [];
}

function getMacrosDefinition(result: SearchableResult | undefined): Location[] {
	if (
		result?.ast instanceof CIdentifier ||
		result?.ast instanceof CMacroCallParam
	) {
		const macro =
			result.runtime.context.parser.cPreprocessorParser.macros.get(
				result.ast instanceof CIdentifier
					? result.ast.name
					: result.ast.value,
			);
		if (macro) {
			return [
				Location.create(
					pathToFileURI(macro.macro.fsPath),
					toRange(macro.macro.identifier),
				),
			];
		}
	}

	return [];
}

export async function getDefinitions(
	location: TextDocumentPositionParams,
	context: ContextAware | undefined,
): Promise<Location[]> {
	return nodeFinder(location, context, (locationMeta) => [
		...getNodeDefinition(locationMeta),
		...getPropertyDefinition(locationMeta),
		...getMacrosDefinition(locationMeta),
	]);
}
