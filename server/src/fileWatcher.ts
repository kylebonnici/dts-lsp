/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { readFileSync, unwatchFile, watchFile } from 'fs';
import { getTokenizedDocumentProvider } from './providers/tokenizedDocument';

const onChange = (file: string, cb: (uri: string) => void) => {
	const newText = readFileSync(file).toString();
	if (getTokenizedDocumentProvider().needsRenew(file, newText)) {
		getTokenizedDocumentProvider().renewLexer(file, newText);
		cb(file);
	} else {
		return console.log(
			'file changed event has the same text, skipping.',
			file,
		);
	}
};

export class FileWatcher {
	#count = 0;
	constructor(
		readonly file: string,
		private cb: (uri: string) => void,
		private hasDirtyState: (uri: string) => boolean,
	) {}

	private onChange?: () => void;

	watch() {
		this.count++;
		if (this.count === 1) {
			console.log('create watch for', this.file);
			const file = this.file;
			const cb = this.cb;
			this.onChange = () => {
				if (this.hasDirtyState(file)) {
					console.log(
						'skipping on change document is open and dirty.',
						file,
					);
					return;
				}
				console.log('onChange', file);
				onChange(file, cb);
			};
			watchFile(file, this.onChange);
		}
	}

	unwatch() {
		if (this.count === 1) {
			console.log('dispose watch for', this.file);
			unwatchFile(this.file, this.onChange);
			this.onChange = undefined;
		}
		this.count--;
	}

	get count() {
		return this.#count;
	}

	set count(count: number) {
		this.#count = count;
		if (count < 0) {
			this.#count = 0;
			console.warn('unwatching an un watched file', this.file);
		}
	}
}
