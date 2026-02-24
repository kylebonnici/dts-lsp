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

const onChange = (fsPath: string, cb: (fsPath: string) => void) => {
	const newText = readFileSync(fsPath).toString();
	if (getTokenizedDocumentProvider().needsRenew(fsPath, newText)) {
		getTokenizedDocumentProvider().renewLexer(fsPath, newText);
		cb(fsPath);
	} else {
		return console.log(
			'file changed event has the same text, skipping.',
			fsPath,
		);
	}
};

export class FileWatcher {
	#count = 0;
	constructor(
		readonly file: string,
		private cb: (fsPath: string) => void,
		private isFileDirty: () => boolean,
	) {}

	private onChange?: () => void;

	watch() {
		this.count++;
		if (this.count === 1) {
			console.log('create watch for', this.file);
			const file = this.file;
			const cb = this.cb;
			this.onChange = () => {
				console.log('onChange - file watcher', file);
				if (this.isFileDirty()) {
					console.log('onChange - file is dirty, skipping');
					return;
				}
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
