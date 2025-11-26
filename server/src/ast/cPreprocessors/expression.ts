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

import { ASTBase } from '../base';
import type { MacroRegistryItem, Token } from '../../types';
import { evalExp, expandMacros } from '../../helpers';
import {
	SerializableExpression,
	SerializableNumberValue,
} from '../../types/index';
import { Operator } from './operator';

export abstract class Expression extends ASTBase {
	operator?: Operator;

	get firstToken() {
		if (this.operator) return this.operator.firstToken;
		return super.firstToken;
	}

	toJson() {
		return -1;
	}

	#resolved?: string;
	resolve(macros: Map<string, MacroRegistryItem>) {
		this.#resolved ??= expandMacros(this.toString(), macros);
		return this.#resolved;
	}

	#evaluate?: any;
	evaluate(macros: Map<string, MacroRegistryItem>) {
		this.#evaluate ??= evalExp(
			`${this.operator ? this.operator.toString() : ''}${this.resolve(macros)}`,
		);
		return this.#evaluate;
	}

	#isTrue?: boolean;
	isTrue(macros: Map<string, MacroRegistryItem>): boolean {
		this.#isTrue ??= evalExp(
			`!!(${this.operator ? this.operator.toString() : ''}${this.resolve(macros)})`,
		) as boolean;
		return this.#isTrue;
	}

	toPrettyString(macros: Map<string, MacroRegistryItem>) {
		const value = this.evaluate(macros);

		return `${value.toString()} /* ${this.toString()}${
			typeof value === 'number' ? ` = 0x${value.toString(16)}` : ''
		} */`;
	}

	serialize(
		macros: Map<string, MacroRegistryItem>,
	): SerializableExpression | SerializableNumberValue {
		return {
			type: 'EXPRESSION',
			value: this.toString(),
			evaluated: this.evaluate(macros),
			uri: this.serializeUri,
			range: this.range,
			issues: this.serializeIssues,
		};
	}
}

export class ComplexExpression extends Expression {
	public openBracket?: Token;
	public closeBracket?: Token;
	public join?: { operator: Operator; expression: Expression }[];

	constructor(
		public readonly expression: Expression,
		private wrapped: boolean,
		join?: { operator: Operator; expression: Expression },
	) {
		super();
		this.addChild(expression);
		if (join) {
			this.addChild(join.operator);
			this.addChild(join.expression);
			this.join = [];
			this.join?.push(join);
		}
	}

	get firstToken() {
		if (this.openBracket) return this.openBracket;
		return super.firstToken;
	}

	get lastToken() {
		if (this.closeBracket) return this.closeBracket;
		return super.lastToken;
	}

	addExpression(operator: Operator, expression: Expression) {
		this.addChild(operator);
		this.addChild(expression);
		this.join ??= [];
		this.join?.push({ operator, expression });
	}

	toString() {
		const exp = this.children
			.map((c) =>
				'radix' in c && c.radix === 16
					? `0x${c.toString()}`
					: c.toString(),
			)
			.join(' ');
		if (this.wrapped) {
			return `(${exp})`;
		}
		return `${exp}`;
	}

	isTrue(macros: Map<string, MacroRegistryItem>): boolean {
		const exp = `(${this.children
			.map((c) =>
				c instanceof Expression ? c.resolve(macros) : c.toString(),
			)
			.join(' ')})`;
		return evalExp(
			`!!(${this.operator ? this.operator.toString() : ''}${exp})`,
		);
	}

	get flatJoin(): { operator: Operator; expression: Expression }[] {
		if (this.wrapped) {
			return (
				this.join ??
				(this.expression instanceof ComplexExpression
					? this.expression.flatJoin
					: [])
			);
		}

		return [
			...(this.expression instanceof ComplexExpression
				? this.expression.flatJoin
				: []),
			...(this.join?.flatMap((j) => [
				{
					operator: j.operator,
					expression:
						j.expression instanceof ComplexExpression
							? j.expression.expression
							: j.expression,
				},
				...(j.expression instanceof ComplexExpression
					? j.expression.flatJoin
					: []),
			]) ?? []),
		];
	}
}
