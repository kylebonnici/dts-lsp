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

import { ASTBase } from "../base";
import { CIdentifier } from "./cIdentifier";
import { Keyword } from "../keyword";
import { CMacro } from "./macro";
import { Token, TokenIndexes } from "../../types";

export class CPreprocessorContent extends ASTBase {
  constructor(tokenIndexes: TokenIndexes) {
    super(tokenIndexes);
  }
}

export abstract class CIfBase extends ASTBase {
  active: boolean = false;

  constructor(
    public readonly keyword: Keyword,
    public readonly content: CPreprocessorContent | null
  ) {
    super();
    this.addChild(keyword);
  }
}

export class CIfDef extends CIfBase {
  constructor(
    keyword: Keyword,
    public readonly identifier: CIdentifier | null,
    content: CPreprocessorContent | null
  ) {
    super(keyword, content);
    this.addChild(identifier);
    this.addChild(content);
  }

  useBlock(macros: Map<string, CMacro>) {
    return this.identifier && macros.has(this.identifier.name);
  }
}

export class CIfNotDef extends CIfDef {
  useBlock(macros: Map<string, CMacro>) {
    return this.identifier && !macros.has(this.identifier.name);
  }
}

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

    const useMainBlock = this.ifDef.useBlock(macros);
    if (useMainBlock) {
      this.ifDef.active = true;
    } else {
      if (this.elseOption) this.elseOption.active = true;
    }

    if (!useMainBlock && this.ifDef.content) {
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

      if (useMainBlock && this.elseOption.content) {
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
