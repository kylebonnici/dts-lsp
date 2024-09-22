import { ASTBase } from '../base';
import { CIdentifier } from './cIdentifier';
import { Keyword } from '../keyword';
import { CMacro } from './macro';
import { Token, TokenIndexes } from '../../types';

export class CPreprocessorContent extends ASTBase {
	constructor(tokenIndexes: TokenIndexes) {
		super(tokenIndexes);
	}
}

export abstract class CIfBase extends ASTBase {
	constructor(
		public readonly keyword: Keyword,
		public readonly content: CPreprocessorContent
	) {
		super();
		this.addChild(keyword);
	}
}

export class CIfDef extends CIfBase {
	constructor(
		keyword: Keyword,
		public readonly identifier: CIdentifier | null,
		content: CPreprocessorContent
	) {
		super(keyword, content);
		this.addChild(identifier);
		this.addChild(content);
	}
}

export class CIfNotDef extends CIfDef {}

export class CElse extends CIfBase {}

export class CEndIf extends Keyword {}

export class IfDefineBlock extends ASTBase {
	constructor(
		public readonly ifDef: CIfDef | CIfNotDef,
		public readonly endIf: CEndIf | null,
		public readonly elseOption?: CElse
	) {
		super();
		this.addChild(ifDef);
		if (elseOption) this.addChild(elseOption);
		this.addChild(endIf);
	}

	getInValidTokenRange(macros: Map<string, CMacro>, tokens: Token[]) {
		const invalidRange: { start: number; end: number }[] = [];

		const getIndex = (token: Token) => tokens.findIndex((t) => t === token);

		if (!this.ifDef.identifier?.name) {
			return [
				{
					start: getIndex(this.tokenIndexes.start),
					end: getIndex(this.tokenIndexes.end),
				},
			];
		}

		invalidRange.push({
			start: getIndex(this.ifDef.tokenIndexes.start),
			end: getIndex(this.ifDef.identifier.tokenIndexes.end),
		});

		const useElseCode = !macros.has(this.ifDef.identifier.name);
		if (useElseCode) {
			invalidRange.push({
				start: getIndex(this.ifDef.content.tokenIndexes.start),
				end: getIndex(this.ifDef.content.tokenIndexes.end),
			});
		}

		if (this.elseOption) {
			invalidRange.push({
				start: getIndex(this.elseOption.tokenIndexes.start),
				end: getIndex(this.elseOption.keyword.tokenIndexes.end),
			});

			if (!useElseCode) {
				invalidRange.push({
					start: getIndex(this.elseOption.content.tokenIndexes.start),
					end: getIndex(this.elseOption.content.tokenIndexes.end),
				});
			}
		}

		if (this.endIf) {
			invalidRange.push({
				start: getIndex(this.endIf.tokenIndexes.start),
				end: getIndex(this.endIf.tokenIndexes.end),
			});
		}

		return invalidRange;
	}
}
