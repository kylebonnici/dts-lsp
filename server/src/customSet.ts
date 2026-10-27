/*
 * Copyright 2026 Kyle Micallef Bonnici
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

import { Token } from './types';

export class CustomSet<T> {
	private values = new Set<T>();

	constructor(
		private readonly cmpFn: (a: T, b: T) => boolean = (a, b) => a === b,
	) {}

	add(value: T): this {
		this.values.add(value);
		return this;
	}

	has(value: T): boolean {
		for (const item of this.values) {
			if (this.cmpFn(item, value)) {
				return true;
			}
		}

		return false;
	}

	delete(value: T): boolean {
		if (!this.values.delete(value)) {
			for (const item of this.values) {
				if (this.cmpFn(item, value)) {
					return this.values.delete(item);
				}
			}
		}

		return true;
	}

	clear(): void {
		this.values.clear();
	}

	get size(): number {
		return this.values.size;
	}

	*[Symbol.iterator](): IterableIterator<T> {
		yield* this.values;
	}
}

export class TokenSet extends CustomSet<Token> {
	constructor() {
		super(cmpTokens);
	}
}

export function cmpTokens(a: Token | undefined, b: Token | undefined): boolean {
	if (!a || !b) return false;
	return (
		a === b ||
		(a.value === b.value &&
			a.pos.line === b.pos.line &&
			a.pos.col === b.pos.col &&
			a.fsPath === b.fsPath)
	);
}
