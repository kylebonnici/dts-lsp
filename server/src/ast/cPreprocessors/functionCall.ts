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

import { DocumentSymbol, SymbolKind } from 'vscode-languageserver';
import { evalExp, isPathEqual, toRange } from '../../helpers';
import { MacroRegistryItem, Token, TokenIndexes } from '../../types';
import { CIdentifier } from './cIdentifier';
import { Expression } from './expression';

export class CMacroCallParam extends Expression {
	public splitToken?: Token;

	constructor(
		public readonly value: string,
		tokenIndexes: TokenIndexes,
		index: number,
	) {
		super(tokenIndexes);
		this.docSymbolsMeta = {
			name: `param${index + 1}`,
			kind: SymbolKind.Variable,
		};
		this.semanticTokenType = 'variable';
		this.semanticTokenModifiers = 'declaration';
	}
	toString() {
		return this.value;
	}
}

export class CMacroCall extends Expression {
	constructor(
		public readonly functionName: CIdentifier,
		public readonly params: (CMacroCallParam | null)[],
	) {
		super();
		this.addChild(functionName);
		this.params.forEach((p) => this.addChild(p));
	}

	getDocumentSymbols(uri: string): DocumentSymbol[] {
		if (!isPathEqual(this.uri, uri)) {
			return [];
		}
		return [
			{
				name: this.functionName.name,
				kind: SymbolKind.Function,
				range: toRange(this),
				selectionRange: toRange(this),
				children: this.params.flatMap(
					(p) => p?.getDocumentSymbols(uri) ?? [],
				),
			},
		];
	}

	toString() {
		return `${this.functionName.toString()}(${this.params
			.map((p) => p?.toString() ?? '')
			.join(', ')})`;
	}

	isTrue(macros: Map<string, MacroRegistryItem>): boolean {
		if (this.functionName.name === 'defined') {
			const defineResult = !!(
				this.params.length === 1 &&
				this.params[0] &&
				macros.has(this.params[0].value)
			);
			return this.operator
				? evalExp(`!!(${this.operator}${defineResult})`)
				: defineResult;
		}

		return super.isTrue(macros);
	}
}
