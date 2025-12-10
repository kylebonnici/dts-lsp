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

import { Range } from 'vscode-languageserver-types';
import { toPosition } from '../../helpers';
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

const getRangeTokens = (startToken: Token, endToken: Token) => {
	let token: Token | undefined = startToken;
	const tokens: Token[] = [];
	while (token) {
		tokens.push(token);
		if (token === endToken) break;
		token = token.nextToken;
	}
	return tokens;
};

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

	get inactiveRanges() {
		if (this.elseOption && !this.elseOption.active) {
			const start = this.elseOption.firstToken;
			const end =
				this.elseOption.content?.lastToken ??
				this.endIf?.firstToken ??
				this.lastToken;
			return [Range.create(toPosition(start), toPosition(end))];
		}

		if (!this.ifDef.active) {
			const start = this.ifDef.firstToken;
			const end = this.ifDef.content
				? this.ifDef.content?.lastToken
				: this.elseOption
					? this.elseOption.firstToken
					: this.endIf?.lastToken;
			return [
				Range.create(
					toPosition(start),
					toPosition(end ?? this.ifDef.lastToken),
				),
			];
		}

		return [];
	}

	getInValidTokenRange(
		macrosResolvers: Map<string, MacroRegistryItem>,
	): WeakSet<Token> {
		// No identifier so ignore all block
		if (!this.ifDef.identifier) {
			return new WeakSet(getRangeTokens(this.firstToken, this.lastToken));
		}

		const useMainBlock = this.ifDef.useBlock(macrosResolvers);
		if (useMainBlock) {
			this.ifDef.active = true;
		} else if (this.elseOption) {
			this.elseOption.active = true;
		}
		return this.getInValidTokenRangeWhenActiveBlock(
			useMainBlock ? this.ifDef : this.elseOption,
		);
	}

	getInValidTokenRangeWhenActiveBlock(activeBlock: CIfBase | undefined) {
		const invalidRange = new WeakSet<Token>();

		const endToken = (this.ifDef.identifier ?? this.ifDef.keyword)
			.lastToken;

		getRangeTokens(this.ifDef.firstToken, endToken).forEach((t) =>
			invalidRange.add(t),
		);

		const useMainBlock = this.ifDef === activeBlock;
		if (!useMainBlock && this.ifDef.content) {
			getRangeTokens(
				this.ifDef.content.firstToken,
				this.ifDef.content.lastToken,
			).forEach((t) => invalidRange.add(t));
		}

		if (this.elseOption) {
			getRangeTokens(
				this.elseOption.firstToken,
				this.elseOption.keyword.lastToken,
			).forEach((t) => invalidRange.add(t));

			if (useMainBlock && this.elseOption.content) {
				getRangeTokens(
					this.elseOption.content.firstToken,
					this.elseOption.content.lastToken,
				).forEach((t) => invalidRange.add(t));
			}
		}

		if (this.endIf) {
			getRangeTokens(this.endIf.firstToken, this.endIf.lastToken).forEach(
				(t) => invalidRange.add(t),
			);
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
	): WeakSet<Token> {
		const activeIf = this.ifBlocks.find((b) => b.useBlock(macros));

		if (activeIf) {
			activeIf.active = true;
		} else if (this.elseOption) {
			this.elseOption.active = true;
		}

		return this.getInValidTokenRangeWhenActiveBlock(
			activeIf ? activeIf : this.elseOption,
		);
	}

	get inactiveRanges(): Range[] {
		const result: Range[] = [];
		const hasElse = !!this.elseOption;
		this.ifBlocks.forEach((block, i) => {
			if (block.active) {
				return;
			}

			const lastIfBlock = i === this.ifBlocks.length - 1;
			const start = block.firstToken;
			const end = lastIfBlock
				? hasElse
					? this.elseOption.firstToken
					: this.lastToken
				: (block.content?.lastToken ??
					this.ifBlocks[i + 1].firstToken ??
					block.lastToken);
			result.push(Range.create(toPosition(start), toPosition(end)));
		});

		if (this.elseOption && result.length) {
			const start = this.elseOption.firstToken;
			const end =
				this.elseOption.content?.lastToken ??
				this.endIf?.lastToken ??
				this.lastToken;
			return [Range.create(toPosition(start), toPosition(end))];
		}

		const start = this.firstToken;
		const end = this.lastToken;
		return [Range.create(toPosition(start), toPosition(end))];
	}

	getInValidTokenRangeWhenActiveBlock(activeBlock: CIfBase | undefined) {
		const invalidRange = new WeakSet<Token>();

		let blockFound = false;
		this.ifBlocks.forEach((ifBlock) => {
			const endToken =
				ifBlock.expression?.lastToken ?? ifBlock.keyword.lastToken;
			getRangeTokens(ifBlock.firstToken, endToken).forEach((t) =>
				invalidRange.add(t),
			);

			if (!blockFound && ifBlock === activeBlock) {
				blockFound = true;
			} else {
				if (ifBlock.content) {
					getRangeTokens(
						ifBlock.content.firstToken,
						ifBlock.content.lastToken,
					).forEach((t) => invalidRange.add(t));
				}
			}
		});

		if (this.elseOption) {
			getRangeTokens(
				this.elseOption.keyword.firstToken,
				this.elseOption.keyword.lastToken,
			).forEach((t) => invalidRange.add(t));

			if (blockFound && this.elseOption.content) {
				getRangeTokens(
					this.elseOption.content.firstToken,
					this.elseOption.content.lastToken,
				).forEach((t) => invalidRange.add(t));
			}
		}

		if (this.endIf) {
			getRangeTokens(this.endIf.firstToken, this.endIf.lastToken).forEach(
				(t) => invalidRange.add(t),
			);
		}

		return invalidRange;
	}
}
