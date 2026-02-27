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

import { SymbolKind } from 'vscode-languageserver';
import { Expression } from '../../cPreprocessors/expression';
import { MacroRegistryItem, TokenIndexes } from '../../../types';
import { SerializedNumberValue } from '../../../types/index';

export class NumberValue extends Expression {
	constructor(
		public readonly value: number,
		tokenIndexes: TokenIndexes,
		private radix = 10,
	) {
		super(tokenIndexes);
		this.docSymbolsMeta = {
			name: this.value.toString(),
			kind: SymbolKind.Number,
		};
		this.semanticTokenType = 'number';
		this.semanticTokenModifiers = 'declaration';
	}

	resolve(_: Map<string, MacroRegistryItem>) {
		return this.value.toString();
	}

	evaluate(_: Map<string, MacroRegistryItem>) {
		return this.value;
	}

	isTrue(_: Map<string, MacroRegistryItem>) {
		return !!this.value;
	}

	toString(radix?: number) {
		return this.value.toString(radix ?? this.radix);
	}

	toJson() {
		return this.value;
	}

	toPrettyString(_: Map<string, MacroRegistryItem>): string {
		const value = this.value;
		if (this.radix === 16) {
			return `0x${value.toString(16)} /* ${
				typeof value === 'number' ? `${value.toString(10)}` : ''
			} */`;
		}

		return `${value.toString(10)} /* ${
			typeof value === 'number' ? `0x${value.toString(16)}` : ''
		} */`;
	}

	serialize(): SerializedNumberValue {
		return {
			type: 'NUMBER_VALUE',
			value: `${this.radix === 16 ? '0x' : ''}${this.toString()}`,
			evaluated: this.value,
			url: this.serializeURL,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}
