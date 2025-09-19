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

import { BindingPropertyType } from '../../../../types/index';
import { NodeType } from '../../../types';
import { generateOrTypeObj, getU32ValueFromProperty } from '../../helpers';
import { genStandardTypeDiagnostic } from '../../../../helpers';
import {
	FileDiagnostic,
	MacroRegistryItem,
	StandardTypeIssue,
} from '../../../../types';
import { Property } from '../../../../context/property';
import addressCells from '../../addressCells';
import sizeCells from '../../sizeCells';
import ranges from '../../ranges';

const matchRootNode = (
	additionalTypeCheck:
		| ((
				property: Property,
				macros: Map<string, MacroRegistryItem>,
		  ) => FileDiagnostic[])
		| undefined,
	property: Property,
	macros: Map<string, MacroRegistryItem>,
) => {
	const issues = additionalTypeCheck?.(property, macros) ?? [];

	const rootNode = property.parent.root.getProperty(property.name);
	const rootNodeValue = rootNode
		? getU32ValueFromProperty(rootNode, 0, 0, macros)
		: undefined;

	const node = property.parent.getProperty(property.name);
	const nodeValue = node
		? getU32ValueFromProperty(node, 0, 0, macros)
		: undefined;

	if (nodeValue !== rootNodeValue) {
		issues.push(
			genStandardTypeDiagnostic(
				StandardTypeIssue.INVALID_VALUE,
				property.ast.rangeTokens,
				property.ast,
				{
					linkedTo: [...(rootNode?.ast ? [rootNode.ast] : [])],
					templateStrings: [
						`${property.name} value in this node must match value of root node`,
					],
				},
			),
		);
	}
	return issues;
};

export function getReservedMemoryNodeType() {
	const nodeType = new NodeType();

	nodeType.noMismatchPropertiesAllowed = true;

	const addressCellsProp = addressCells();
	const addressAdditionalTypeCheck = addressCellsProp?.additionalTypeCheck;
	addressCellsProp!.additionalTypeCheck = (property, macros) => {
		return matchRootNode(addressAdditionalTypeCheck, property, macros);
	};
	addressCellsProp!.required = () => 'required';

	const sizeCellsProp = sizeCells();
	const sizeCellsAdditionalTypeCheck = sizeCellsProp?.additionalTypeCheck;
	sizeCellsProp!.additionalTypeCheck = (property, macros) => {
		return matchRootNode(sizeCellsAdditionalTypeCheck, property, macros);
	};
	sizeCellsProp!.required = () => 'required';

	const rangesProp = ranges();
	rangesProp!.required = () => 'required';
	rangesProp!.type = generateOrTypeObj(BindingPropertyType.EMPTY);
	rangesProp!.additionalTypeCheck = undefined;

	nodeType.addProperty([addressCellsProp, sizeCellsProp, rangesProp]);

	return nodeType;
}
