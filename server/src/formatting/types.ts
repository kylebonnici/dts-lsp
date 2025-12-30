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

import {
	DocumentFormattingParams,
	DocumentRangeFormattingParams,
	FormattingOptions,
} from 'vscode-languageserver';
import { ASTBase } from '../ast/base';

export type FormattingSettings = {
	tabSize: number;
	insertSpaces: boolean;
	singleIndent: string;
	wordWrapColumn: number;
};

export type FormattingFlags = {
	runBaseCheck: boolean;
	runLongLineCheck: boolean;
	runExpressionIndentationCheck: boolean;
};

export type CustomDocumentFormattingParams = (
	| DocumentFormattingParams
	| DocumentRangeFormattingParams
) & {
	options: FormattingOptions & {
		wordWrapColumn: number;
	};
};

export type LevelMeta = {
	level: number;
	inAst?: ASTBase;
};
