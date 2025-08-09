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
import { ASTBase } from '../../base';
import type { Token } from '../../../types';
import { SerializableByteString } from '../../../types/index';
import { LabeledValue } from './labeledValue';
import { NumberValue } from './number';

export class ByteStringValue extends ASTBase {
	public openBracket?: Token;
	public closeBracket?: Token;

	constructor(public readonly values: LabeledValue<NumberValue>[]) {
		super();
		this.docSymbolsMeta = {
			name: 'Byte String Value',
			kind: SymbolKind.Array,
		};
		this.values.forEach((value) => this.addChild(value));
	}

	toString() {
		return `[${this.values
			.map((v) => v.toString(16).padStart(2, '0'))
			.join(' ')}]`;
	}

	toJson() {
		return this.values.map((v) => v.value?.toJson() ?? NaN);
	}

	serialize(): SerializableByteString {
		return {
			type: 'BYTESTRING',
			values: this.values.map((v) =>
				v.value
					? {
							value: v.value.toString(16),
							range: v.value.range,
							evaluated: v.value.value,
						}
					: null,
			),
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}
