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
import { PropertyName } from './ast/dtc/property';
import { Property } from './context/property';
import { DeleteProperty } from './ast/dtc/deleteProperty';
import { isDeleteChild } from './ast/helpers';
import {
	convertVirtualFsPathToDocumentFsPath,
	nodeFinder,
	pathToFileURI,
	toRange,
} from './helpers';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';
import { StringValue } from './ast/dtc/values/string';
import { CMacroCallParam } from './ast/cPreprocessors/functionCall';

export const generateNodeDeclaration = (node: Node) => {
	const declaration = node.definitions.at(0);
	const virtualDoc =
		declaration && convertVirtualFsPathToDocumentFsPath(declaration.fsPath);
	if (virtualDoc) {
		return Location.create(
			pathToFileURI(virtualDoc.docFsPath),
			virtualDoc.range,
		);
	}
	return declaration
		? Location.create(
				pathToFileURI(declaration.fsPath),
				toRange(declaration),
			)
		: undefined;
};

const getBottomProperty = (property: Property): Property => {
	if (property.replaces) {
		return getBottomProperty(property.replaces);
	}

	return property;
};

export const generatePropertyDeclaration = (
	property: Property,
): Location | undefined => {
	const fistDefinition = getBottomProperty(property);
	const virtualDoc = convertVirtualFsPathToDocumentFsPath(
		fistDefinition.ast.fsPath,
	);
	if (virtualDoc) {
		return Location.create(
			pathToFileURI(virtualDoc.docFsPath),
			virtualDoc.range,
		);
	}
	return fistDefinition
		? Location.create(
				pathToFileURI(fistDefinition.ast.fsPath),
				toRange(fistDefinition.ast),
			)
		: undefined;
};

function getPropertyDeclaration(
	result: SearchableResult | undefined,
): Location | undefined {
	if (
		!result ||
		result.item === null ||
		!(result.ast instanceof PropertyName)
	) {
		return;
	}

	const gentItem = (property: Property) => {
		const virtualDoc = convertVirtualFsPathToDocumentFsPath(
			property.ast.fsPath,
		);
		if (virtualDoc) {
			return Location.create(
				pathToFileURI(virtualDoc.docFsPath),
				virtualDoc.range,
			);
		}
		return Location.create(
			pathToFileURI(property.ast.fsPath),
			toRange(property.ast.propertyName ?? property.ast),
		);
	};

	if (result.item instanceof Property && result.ast instanceof PropertyName) {
		return gentItem(getBottomProperty(result.item));
	}

	if (
		result.item instanceof Node &&
		result.ast instanceof PropertyName &&
		result.ast.parentNode instanceof DeleteProperty
	) {
		const property = result.item.deletedProperties.find(
			(d) => d.by === result.ast.parentNode,
		)?.property;
		if (property) return gentItem(getBottomProperty(property));
	}
}

function getNodeDeclaration(
	result: SearchableResult | undefined,
): Location | undefined {
	if (!result) {
		return;
	}

	if (result.item instanceof Node && !isDeleteChild(result.ast)) {
		return generateNodeDeclaration(result.item);
	}

	if (
		result.ast instanceof Label &&
		result.ast.parentNode instanceof LabelRef
	) {
		if (result.ast.parentNode.linksTo) {
			return generateNodeDeclaration(result.ast.parentNode.linksTo);
		}
	}

	if (result.ast instanceof NodeName) {
		if (result.ast.linksTo) {
			return generateNodeDeclaration(result.ast.linksTo);
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
			return generateNodeDeclaration(node);
		}
	}
}

function getMacrosDeclaration(
	result: SearchableResult | undefined,
): Location | undefined {
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
			return Location.create(
				pathToFileURI(macro.macro.fsPath),
				toRange(macro.macro.identifier),
			);
		}
	}
}

export async function getDeclaration(
	location: TextDocumentPositionParams,
	context: ContextAware | undefined,
): Promise<Location | undefined> {
	return (
		await nodeFinder(location, context, (locationMeta) => [
			getNodeDeclaration(locationMeta) ||
				getPropertyDeclaration(locationMeta) ||
				getMacrosDeclaration(locationMeta),
		])
	).at(0);
}
