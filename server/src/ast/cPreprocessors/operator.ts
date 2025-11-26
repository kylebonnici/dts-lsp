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

import { TokenIndexes } from '../../types';
import { ASTBase } from '../base';

export enum OperatorType {
	BIT_AND = '&',
	BIT_OR = '|',
	BIT_NOT = '~',
	LOGICAL_NOT = '!',
	BIT_XOR = '^',
	BIT_RIGHT_SHIFT = '>>',
	BIT_LEFT_SHIFT = '<<',
	ARITHMETIC_ADD = '+',
	ARITHMETIC_DIVIDE = '/',
	ARITHMETIC_MODULES = '%',
	ARITHMETIC_MULTIPLE = '*',
	ARITHMETIC_SUBTRACT = '-',
	BOOLEAN_GT = '>',
	BOOLEAN_LT = '<',
	BOOLEAN_AND = '&&',
	BOOLEAN_GT_EQUAL = '>=',
	BOOLEAN_LT_EQUAL = '<=',
	BOOLEAN_NOT_EQ = '!=',
	BOOLEAN_EQ = '==',
	BOOLEAN_OR = '||',
	C_CONCAT = '##',
}

export class Operator extends ASTBase {
	constructor(
		public readonly operator: OperatorType,
		tokenIndexes: TokenIndexes,
	) {
		super(tokenIndexes);
		this.semanticTokenType = 'operator';
		this.semanticTokenModifiers = 'declaration';
	}

	toString() {
		return this.operator;
	}
}
