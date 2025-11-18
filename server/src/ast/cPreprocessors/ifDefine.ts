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
import { Keyword } from '../keyword';
import { MacroRegistryItem, Token, TokenIndexes } from '../../types';
import { CIdentifier } from './cIdentifier';
import { Expression } from './expression';

export class CPreprocessorContent extends ASTBase {
	constructor(tokenIndexes: TokenIndexes) {
		super(tokenIndexes);
	}
}

export abstract class CIfBase extends ASTBase {
	active: boolean = false;

	constructor(
		public readonly keyword: Keyword,
		public readonly content: CPreprocessorContent | null,
	) {
		super();
		this.addChild(keyword);
	}
}

export class CIfDef extends CIfBase {
	constructor(
		keyword: Keyword,
		public readonly identifier: CIdentifier | null,
		content: CPreprocessorContent | null,
	) {
		super(keyword, content);
		this.addChild(identifier);
		this.addChild(content);
	}

	useBlock(macrosResolvers: Map<string, MacroRegistryItem>) {
		return this.identifier && macrosResolvers.has(this.identifier.name);
	}
}

export class CIf extends CIfBase {
	constructor(
		keyword: Keyword,
		public readonly expression: Expression | null,
		content: CPreprocessorContent | null,
	) {
		super(keyword, content);
		this.addChild(expression);
		this.addChild(content);
	}

	useBlock(macros: Map<string, MacroRegistryItem>) {
		return this.expression?.isTrue(macros);
	}
}

export class CIfNotDef extends CIfDef {
	useBlock(macrosResolvers: Map<string, MacroRegistryItem>) {
		return this.identifier && !macrosResolvers.has(this.identifier.name);
	}
}

export class CElse extends CIfBase {}

export class CEndIf extends Keyword {}

export class IfDefineBlock extends ASTBase {
	constructor(
		public readonly ifDef: CIfDef | CIfNotDef,
		public readonly endIf: CEndIf | null,
		public readonly elseOption?: CElse,
	) {
		super();
		this.addChild(ifDef);
		if (elseOption) this.addChild(elseOption);
		this.addChild(endIf);
	}

	getInValidTokenRange(
		macrosResolvers: Map<string, MacroRegistryItem>,
		tokens: Token[],
	) {
		const getIndex = (token: Token) => tokens.findIndex((t) => t === token);

		// No identifier so ignore all block
		if (!this.ifDef.identifier) {
			return [
				{
					start: getIndex(this.firstToken),
					end: getIndex(this.lastToken),
				},
			];
		}

		const useMainBlock = this.ifDef.useBlock(macrosResolvers);
		return this.getInValidTokenRangeWhenActiveBlock(
			useMainBlock ? this.ifDef : this.elseOption,
			tokens,
		);
	}

	getInValidTokenRangeWhenActiveBlock(
		activeBlock: CIfBase | undefined,
		tokens: Token[],
	) {
		const invalidRange: { start: number; end: number }[] = [];

		const getIndex = (token: Token) => tokens.findIndex((t) => t === token);

		invalidRange.push({
			start: getIndex(this.ifDef.firstToken),
			end: getIndex(
				(this.ifDef.identifier ?? this.ifDef.keyword).lastToken,
			),
		});

		const useMainBlock = this.ifDef === activeBlock;
		if (useMainBlock) {
			this.ifDef.active = true;
		} else {
			if (this.elseOption) this.elseOption.active = true;
		}

		if (!useMainBlock && this.ifDef.content) {
			invalidRange.push({
				start: getIndex(this.ifDef.content.firstToken),
				end: getIndex(this.ifDef.content.lastToken),
			});
		}

		if (this.elseOption) {
			invalidRange.push({
				start: getIndex(this.elseOption.firstToken),
				end: getIndex(this.elseOption.keyword.lastToken),
			});

			if (useMainBlock && this.elseOption.content) {
				invalidRange.push({
					start: getIndex(this.elseOption.content.firstToken),
					end: getIndex(this.elseOption.content.lastToken),
				});
			}
		}

		if (this.endIf) {
			invalidRange.push({
				start: getIndex(this.endIf.firstToken),
				end: getIndex(this.endIf.lastToken),
			});
		}

		return invalidRange;
	}
}

export class IfElIfBlock extends ASTBase {
	constructor(
		public readonly ifBlocks: CIf[],
		public readonly endIf: CEndIf | null,
		public readonly elseOption?: CElse,
	) {
		super();

		ifBlocks.forEach((i) => this.addChild(i));
		if (elseOption) this.addChild(elseOption);
		this.addChild(endIf);
	}

	getInValidTokenRange(
		macros: Map<string, MacroRegistryItem>,
		tokens: Token[],
	) {
		const activeIf = this.ifBlocks.find((b) => b.useBlock(macros));

		return this.getInValidTokenRangeWhenActiveBlock(
			activeIf ? activeIf : this.elseOption,
			tokens,
		);
	}

	getInValidTokenRangeWhenActiveBlock(
		activeBlock: CIfBase | undefined,
		tokens: Token[],
	) {
		const invalidRange: { start: number; end: number }[] = [];

		const getIndex = (token: Token) => tokens.findIndex((t) => t === token);

		let blockFound = false;
		this.ifBlocks.forEach((ifBlock) => {
			invalidRange.push({
				start: getIndex(ifBlock.firstToken),
				end: getIndex(
					ifBlock.expression?.lastToken ?? ifBlock.keyword.lastToken,
				),
			});

			if (!blockFound && ifBlock === activeBlock) {
				ifBlock.active = true;
				blockFound = true;
			} else {
				if (ifBlock.content) {
					invalidRange.push({
						start: getIndex(ifBlock.content.firstToken),
						end: getIndex(ifBlock.content.lastToken),
					});
				}
			}
		});

		if (this.elseOption) {
			invalidRange.push({
				start: getIndex(this.elseOption.keyword.firstToken),
				end: getIndex(this.elseOption.keyword.lastToken),
			});

			if (blockFound && this.elseOption.content) {
				invalidRange.push({
					start: getIndex(this.elseOption.content.firstToken),
					end: getIndex(this.elseOption.content.lastToken),
				});
			} else {
				this.elseOption.active = true;
			}
		}

		if (this.endIf) {
			invalidRange.push({
				start: getIndex(this.endIf.firstToken),
				end: getIndex(this.endIf.lastToken),
			});
		}

		return invalidRange;
	}
}
