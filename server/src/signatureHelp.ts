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
	ParameterInformation,
	SignatureHelp,
	SignatureHelpParams,
	SignatureInformation,
} from 'vscode-languageserver';
import { getCMacroCall, nodeFinder } from './helpers';
import { ContextAware } from './runtimeEvaluator';
import { SearchableResult } from './types';
import { Property } from './context/property';
import { FunctionDefinition } from './ast/cPreprocessors/functionDefinition';
import { CIdentifier } from './ast/cPreprocessors/cIdentifier';

function getPropertySignatureHelp(
	result: SearchableResult | undefined,
): SignatureHelp | undefined {
	if (!result || !(result.item instanceof Property)) {
		return;
	}

	const signatureHelp = result.item.parent.nodeType?.getSignatureHelp?.(
		result.item,
		result.ast,
		result.beforeAst,
		result.afterAst,
	);

	return signatureHelp;
}

async function getMacroFuncSignatureHelp(
	result: SearchableResult | undefined,
): Promise<SignatureHelp | undefined> {
	const macroCall = getCMacroCall(result?.ast);
	if (
		!macroCall ||
		!macroCall.params.length ||
		!result?.ast ||
		result.ast === macroCall.functionName
	) {
		return;
	}

	const lastParser = (await result.runtime.context.getAllParsers()).at(-1)!;
	const macroDef = lastParser.cPreprocessorParser.macros.get(
		macroCall.functionName.name,
	)?.macro.identifier;

	if (!macroDef || !(macroDef instanceof FunctionDefinition)) {
		return;
	}

	const signatureArgs: ParameterInformation[] = macroDef.params.map((p) => ({
		label: p instanceof CIdentifier ? p.name : '...',
	}));

	let param = macroCall.params.find(
		(p) => p && (result.ast === p || p.isAncestorOf(result.ast)),
	);

	param ??= result.afterAst
		? macroCall.params.find(
				(p) =>
					p &&
					(result.afterAst === p || p.isAncestorOf(result.afterAst!)),
			)
		: undefined;
	param ??= result.beforeAst
		? macroCall.params.find(
				(p) =>
					p &&
					(result.beforeAst === p ||
						p.isAncestorOf(result.beforeAst!)),
			)
		: undefined;

	return {
		signatures: [
			SignatureInformation.create(
				`${macroCall.functionName.name}(${signatureArgs
					.map((arg) => arg.label)
					.join(', ')})`,
				undefined,
				...signatureArgs.flat(),
			),
		],
		activeSignature: 0,
		activeParameter: param ? macroCall.params.indexOf(param) : undefined,
	};
}

export async function getSignatureHelp(
	location: SignatureHelpParams,
	context: ContextAware | undefined,
): Promise<SignatureHelp | undefined> {
	if (!context) return;

	return (
		await nodeFinder(location, context, async (locationMeta) => [
			(await getMacroFuncSignatureHelp(locationMeta)) ||
				getPropertySignatureHelp(locationMeta),
		])
	).at(0);
}
