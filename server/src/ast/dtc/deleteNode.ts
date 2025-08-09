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

import { Keyword } from '../keyword';
import { NodeName } from './node';
import { LabelRef } from './labelRef';
import { DeleteBase } from './delete';
import { NodePathRef } from './values/nodePath';

export class DeleteNode extends DeleteBase {
	private _nodeNameOrRef: NodeName | LabelRef | NodePathRef | null = null;

	constructor(keyword: Keyword) {
		super('Delete Node', keyword);
	}

	set nodeNameOrRef(nodeNameOrRef: NodeName | LabelRef | NodePathRef | null) {
		if (this._nodeNameOrRef)
			throw new Error('Only one property name is allowed');
		this._nodeNameOrRef = nodeNameOrRef;
		this.addChild(nodeNameOrRef);
	}

	get nodeNameOrRef() {
		return this._nodeNameOrRef;
	}
}
