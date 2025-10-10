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

import { existsSync, readFileSync } from 'fs';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Token } from '../types';
import { Lexer } from '../lexer';
import { normalizePath } from '../helpers';
import { getCachedCPreprocessorParserProvider } from './cachedCPreprocessorParser';

let tokenizedDocumentProvider: TokenizedDocumentProvider | undefined;

class TokenizedDocumentProvider {
	private fileMap = new Map<string, Lexer>();

	static clone(tokens: Token[]) {
		const len = tokens.length;
		if (len === 0) return [];

		const newList: Token[] = new Array(len);
		let prev: Token | undefined = undefined;

		for (let i = 0; i < len; i++) {
			const token = tokens[i];
			const t: Token = {
				tokens: token.tokens,
				pos: token.pos,
				value: token.value,
				uri: token.uri,
				prevToken: prev,
				nextToken: undefined,
			};
			if (prev) prev.nextToken = t;
			newList[i] = t;
			prev = t;
		}

		return newList;
	}

	needsRenew(uri: string, text: string) {
		uri = normalizePath(uri);
		return this.fileMap.get(uri)?.text !== text;
	}

	getDocument(uri: string, text?: string) {
		return TextDocument.create(
			uri,
			'devicetree',
			0,
			text ?? this.fileMap.get(uri)?.text ?? readFileSync(uri).toString(),
		);
	}

	renewLexer(uri: string, text?: string): Token[] {
		uri = normalizePath(uri);
		getCachedCPreprocessorParserProvider().reset(uri);
		if (!text && !existsSync(uri)) {
			return [];
		}

		try {
			text ??= readFileSync(uri).toString();
			const lexer = new Lexer(text, uri);
			this.fileMap.set(uri, lexer);
			return TokenizedDocumentProvider.clone(lexer.tokens);
		} catch {
			//
		}

		return [];
	}

	requestTokens(uri: string, renewIfNotFound: boolean): Token[] {
		uri = normalizePath(uri);
		const tokens = this.fileMap.get(uri)?.tokens;
		if (!tokens && renewIfNotFound) {
			return [...this.renewLexer(uri)];
		}
		return TokenizedDocumentProvider.clone(tokens ?? []);
	}

	reset(uri: string) {
		uri = normalizePath(uri);
		getCachedCPreprocessorParserProvider().reset(uri);
		this.fileMap.delete(uri);
	}
}

export function getTokenizedDocumentProvider(): TokenizedDocumentProvider {
	tokenizedDocumentProvider ??= new TokenizedDocumentProvider();
	return tokenizedDocumentProvider;
}

export function resetTokenizedDocumentProvider() {
	tokenizedDocumentProvider = new TokenizedDocumentProvider();
}
