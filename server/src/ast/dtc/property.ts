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
import { MacroRegistryItem, Token, TokenIndexes } from '../../types';
import { ASTBase } from '../base';
import {
	SerializedDtcProperty,
	SerializedPropertyName,
} from '../../types/index';
import { LabelAssign } from './label';
import { PropertyValues } from './values/values';
import { StringValue } from './values/string';
import { ArrayValues } from './values/arrayValue';
import { NumberValue } from './values/number';
import { ByteStringValue } from './values/byteString';
import { Comment, CommentBlock } from './comment';

export class PropertyName extends ASTBase {
	constructor(
		public readonly name: string,
		tokenIndex: TokenIndexes,
	) {
		super(tokenIndex);
		this.semanticTokenType = 'property';
		this.semanticTokenModifiers = 'declaration';
	}

	toString() {
		return this.name;
	}

	serialize(): SerializedPropertyName {
		return {
			value: this.name,
			url: this.serializeURL,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class DtcProperty extends ASTBase {
	public topComment?: Comment | CommentBlock;
	public endComment?: Comment | CommentBlock;
	private _values: PropertyValues | null | undefined = undefined;
	public assignOperatorToken?: Token;

	constructor(
		public readonly propertyName: PropertyName,
		public readonly labels: LabelAssign[] = [],
	) {
		super();
		this.docSymbolsMeta = {
			name: this.propertyName?.name ?? 'Unknown',
			kind: SymbolKind.Property,
		};
		this.labels.forEach((label) => this.addChild(label));
		this.addChild(propertyName);
	}

	set values(values: PropertyValues | null | undefined) {
		if (this._values) throw new Error('Only one property name is allowed');
		this._values = values;
		this.addChild(values);
	}

	get values() {
		return this._values;
	}

	get quickValues() {
		return this.values?.values.map((v) => {
			if (!v) {
				return null;
			}
			if (v.value instanceof StringValue) {
				return v.value.value;
			}

			if (v.value instanceof ArrayValues) {
				return v.value.values.map((v) =>
					v.value instanceof NumberValue ? v.value.value : NaN,
				);
			}

			if (v.value instanceof ByteStringValue) {
				return v.value.values.map((v) => v.value?.value ?? NaN);
			}

			return NaN;
		});
	}

	getFlatAstValues() {
		return this.values?.values.flatMap((v) => {
			if (!v) {
				return null;
			}
			if (v.value instanceof StringValue) {
				return v.value;
			}

			if (v.value instanceof ArrayValues) {
				return v.value.values.map((v) => v.value);
			}

			if (v.value instanceof ByteStringValue) {
				return v.value.values.map((v) => v.value);
			}

			return v.value;
		});
	}

	toString() {
		return `${this.propertyName?.toString() ?? '__UNSET__'}${
			this.assignOperatorToken
				? ` = ${
						this._values?.values
							.map((v) => v?.toString() ?? 'NULL')
							.join(', ') ?? 'NULL'
					}`
				: ''
		};`;
	}

	toPrettyString(macros: Map<string, MacroRegistryItem>, level?: number) {
		return `${this.propertyName?.toString() ?? '__UNSET__'}${
			this.assignOperatorToken
				? ` = ${
						this._values?.values
							.map((v) => v?.toPrettyString(macros) ?? 'NULL')
							.join(level ? `,\n${'\t'.repeat(level)}` : ', ') ??
						'NULL'
					}`
				: ''
		};`;
	}

	serialize(macros: Map<string, MacroRegistryItem>): SerializedDtcProperty {
		return {
			name: this.propertyName?.serialize() ?? null,
			values:
				this.values === undefined
					? undefined
					: (this.values?.values.map(
							(v) => v?.value?.serialize(macros) ?? null,
						) ?? null),
			url: this.serializeURL,
			range: this.range,
			issues: [
				...this.serializeIssues,
				...(this.values?.issues.map((i) => i()) ?? []),
			],
		};
	}
}
