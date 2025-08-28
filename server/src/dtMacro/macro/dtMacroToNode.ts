/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { Node } from '../../context/node';
import { dtPropNode } from '../dtProp';
import { dtPropByIndexNode } from '../dtPropByIndex';
import { dtPropOrNode } from '../dtPropOr';
import { findMacroDefinition, ResolveMacroRequest } from '../helpers';
import { dtBus } from './bus/dtBus';
import { dtChosen } from './chosen/dtChosen';
import { dtAlias } from './node/dtAlias';
import { dtChild } from './node/dtChild';
import { dtCompatGetAnyStatusOkNode } from './node/dtCompatGetAnyStatusOk';
import { dtGParent } from './node/dtGParent';
import { dtInst } from './node/dtInst';
import { dtNodeLabel } from './node/dtNodeLabel';
import { dtParent } from './node/dtParent';
import { dtPath } from './node/dtPath';
import { dtRoot } from './node/dtRoot';
import { dtEnumIndexByIndexOr } from './properties/dtEnumIndexByIndexOr';
import { dtEnumIndexOr } from './properties/dtEnumIndexOr';
import { dtPhaByIndexOr } from './properties/dtPhaByIndexOr';
import { dtPhaByNameOr } from './properties/dtPhaByNameOr';
import { dtPhandel } from './properties/dtPhandel';
import { dtPhandelByIndex } from './properties/dtPhandelByIndex';
import { dtPhandelByName } from './properties/dtPhandelByName';
import { dtPhaOr } from './properties/dtPhaOr';
import { dtPropByPhandleIndexOr } from './properties/dtPropByPhandleIndexOr';
import { dtPropLenOr } from './properties/dtPropLenOr';
import { dtPropOr } from './properties/dtPropOr';
import { dtStringTokenOr } from './properties/dtStringTokenOr';
import { dtStringUnquotedOr } from './properties/dtStringUnquotedOr';
import { dtStringUpperTokenOr } from './properties/dtStringUpperTokenOr';

function getNodeOrUndefined<T>(
	action: (
		resolveMacroRequest: ResolveMacroRequest,
		dtMacroToNode: (
			resolveMacroRequest: ResolveMacroRequest,
		) => Promise<Node | undefined>,
	) => T,
) {
	return async (
		resolveMacroRequest: ResolveMacroRequest,
		dtMacroToNode: (
			resolveMacroRequest: ResolveMacroRequest,
		) => Promise<Node | undefined>,
	) => {
		const result = await action(resolveMacroRequest, dtMacroToNode);

		if (result instanceof Node) {
			return result;
		}
	};
}

export async function dtMacroToNode({
	macro,
	document,
	context,
	position,
}: ResolveMacroRequest): Promise<Node | undefined> {
	if (
		['DT_ALIAS', 'DT_NODELABEL'].some((m) => m === macro.parent?.macro) ||
		(macro.parent?.macro === 'DT_CHILD' && macro.argIndexInParent === 1)
	) {
		macro = macro.parent!;
	} else if (macro.parent?.macro === 'DT_HAS_ALIAS') {
		macro = macro.parent;
		macro.macro = 'DT_ALIAS';
	} else if (macro.parent?.macro === 'DT_PATH') {
		macro.parent.args =
			macro.parent.args?.slice(0, (macro.argIndexInParent ?? 0) + 1) ??
			[];
		macro = macro.parent;
	}
	const funcs: ((
		resolveMacroRequest: ResolveMacroRequest,
		dtMacroToNode: (
			resolveMacroRequest: ResolveMacroRequest,
		) => Promise<Node | undefined>,
	) => Promise<Node | undefined>)[] = [
		//
		dtBus,
		//
		dtChosen,
		//
		dtAlias,
		dtChild,
		dtCompatGetAnyStatusOkNode,
		dtGParent,
		dtInst,
		dtNodeLabel,
		dtParent,
		dtPath,
		dtPhandel,
		dtPhandelByIndex,
		dtPhandelByName,
		dtPropByIndexNode,
		dtPropNode,
		dtPropOrNode,
		dtRoot,
		getNodeOrUndefined(dtEnumIndexByIndexOr),
		getNodeOrUndefined(dtEnumIndexOr),
		getNodeOrUndefined(dtPhaByIndexOr),
		getNodeOrUndefined(dtPhaByNameOr),
		getNodeOrUndefined(dtPhaOr),
		getNodeOrUndefined(dtPropByPhandleIndexOr),
		getNodeOrUndefined(dtPropLenOr),
		getNodeOrUndefined(dtPropOr),
		getNodeOrUndefined(dtStringTokenOr),
		getNodeOrUndefined(dtStringUnquotedOr),
		getNodeOrUndefined(dtStringUpperTokenOr),
	];

	const v = await funcs.reduce(
		(accPromise, fn) =>
			accPromise.then(
				(v) =>
					v ||
					fn({ macro, document, context, position }, dtMacroToNode),
			),
		Promise.resolve<Node | undefined>(undefined),
	);

	if (v) {
		return Array.isArray(v) ? v.at(0) : v;
	}

	const newMacro = await findMacroDefinition(
		document,
		macro.macro,
		position,
		context,
	);

	if (!newMacro) {
		return;
	}

	return dtMacroToNode({ document, macro: newMacro[0], context, position });
}
