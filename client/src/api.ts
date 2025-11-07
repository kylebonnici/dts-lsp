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

import { EventEmitter } from 'events';
import * as vscode from 'vscode';
import type {
	Actions,
	Context,
	ContextListItem,
	EvaluatedMacro,
	IntegrationSettings,
	LocationResult,
	PositionScopeInformation,
	ResolvedSettings,
	SerializedNode,
	ZephyrBindingYml,
} from 'devicetree-language-server-types';
import {
	LanguageClient,
	NotificationType,
	TextDocumentPositionParams,
	Disposable,
	TextEdit,
} from 'vscode-languageclient/node';
import { IDeviceTreeAPI as IDeviceTreeAPI } from './types';
import { getCurrentTextDocumentPositionParams } from './helpers';

const contextDeletedNotification = new NotificationType<ContextListItem>(
	'devicetree/contextDeleted',
);
const contextCreatedNotification = new NotificationType<ContextListItem>(
	'devicetree/contextCreated',
);
const newActiveContextNotification = new NotificationType<
	ContextListItem | undefined
>('devicetree/newActiveContext');

const activeContextStableNotification = new NotificationType<ContextListItem>(
	'devicetree/activeContextStableNotification',
);
const contextStableNotification = new NotificationType<ContextListItem>(
	'devicetree/contextStableNotification',
);

const settingsChangedNotification = new NotificationType<ContextListItem>(
	'devicetree/settingsChanged',
);

export class API implements IDeviceTreeAPI {
	constructor(private readonly client: LanguageClient) {
		this.client.onNotification(contextDeletedNotification, (ctx) =>
			this.event.emit('onContextDeleted', ctx),
		);
		this.client.onNotification(contextCreatedNotification, (ctx) =>
			this.event.emit('onContextCreated', ctx),
		);
		this.client.onNotification(newActiveContextNotification, (ctx) =>
			this.event.emit('onActiveContextChange', ctx),
		);
		this.client.onNotification(activeContextStableNotification, (result) =>
			this.event.emit('onActiveContextStable', result),
		);
		this.client.onNotification(contextStableNotification, (result) =>
			this.event.emit('onContextStable', result),
		);
		this.client.onNotification(settingsChangedNotification, (ctx) =>
			this.event.emit('onSettingsChanged', ctx),
		);
	}
	private event = new EventEmitter();
	version = '0.0.0';

	setDefaultSettings(settings: IntegrationSettings): Promise<void> {
		return this.client.sendRequest(
			'devicetree/setDefaultSettings',
			settings,
		);
	}

	getContexts(): Promise<ContextListItem[]> {
		return this.client.sendRequest('devicetree/getContexts');
	}

	setActiveContextById(id: string) {
		return this.client.sendRequest('devicetree/setActive', {
			id,
		}) as Promise<boolean>;
	}

	setActiveContextByName(name: string) {
		return this.client.sendRequest('devicetree/setActive', {
			name,
		}) as Promise<boolean>;
	}

	getActiveContext() {
		return this.client.sendRequest(
			'devicetree/getActiveContext',
		) as Promise<ContextListItem | undefined>;
	}

	async getActivePathLocation(): Promise<LocationResult | undefined> {
		const location = getCurrentTextDocumentPositionParams();
		if (!location) return;
		const result = await this.getPathLocation(location);

		if (result) {
			this.event.emit('onActivePath', result);
		}

		return result;
	}

	async getPathLocation(
		textDocumentPositionParams: TextDocumentPositionParams,
	): Promise<LocationResult | undefined> {
		return await this.client.sendRequest<LocationResult | undefined>(
			'devicetree/activePath',
			textDocumentPositionParams,
		);
	}

	requestContext(ctx: Context) {
		return this.client.sendRequest(
			'devicetree/requestContext',
			ctx,
		) as Promise<ContextListItem>;
	}

	removeContext(id: string, name: string) {
		return this.client.sendRequest('devicetree/removeContext', {
			id,
			name,
		}) as Promise<void>;
	}

	compiledOutput(id: string) {
		return this.client.sendRequest(
			'devicetree/compiledDtsOutput',
			id,
		) as Promise<string | undefined>;
	}

	async copyZephyrCMacroIdentifier(
		textDocumentPositionParams: TextDocumentPositionParams,
	): Promise<void> {
		await vscode.commands.executeCommand(
			'devicetree.clipboard.dtMacro',
			textDocumentPositionParams,
		);
	}

	serializedContext(id: string) {
		return this.client.sendRequest(
			'devicetree/serializedContext',
			id,
		) as Promise<SerializedNode | undefined>;
	}

	formatTextEdits(event) {
		return this.client.sendRequest(
			'devicetree/formatTextEdits',
			event,
		) as Promise<TextEdit>;
	}

	onActiveContextChange(
		listener: (ctx: ContextListItem | undefined) => void,
	): Disposable {
		this.event.addListener('onActiveContextChange', listener);
		return {
			dispose: () => {
				this.event.removeListener('onActiveContextChange', listener);
			},
		};
	}

	onActiveContextStable(listener: (ctx: ContextListItem) => void) {
		this.event.addListener('onActiveContextStable', listener);
		return {
			dispose: () => {
				this.event.removeListener('onActiveContextStable', listener);
			},
		};
	}

	onActivePath(listener: (path: LocationResult) => void) {
		this.event.addListener('onActivePath', listener);
		return {
			dispose: () => {
				this.event.removeListener('onActivePath', listener);
			},
		};
	}

	onContextStable(listener: (ctx: ContextListItem) => void) {
		this.event.addListener('onContextStable', listener);
		return {
			dispose: () => {
				this.event.removeListener('onContextStable', listener);
			},
		};
	}

	onContextDeleted(listener: (ctx: ContextListItem) => void) {
		this.event.addListener('onContextDeleted', listener);
		return {
			dispose: () => {
				this.event.removeListener('onContextDeleted', listener);
			},
		};
	}

	onContextCreated(listener: (ctx: ContextListItem) => void) {
		this.event.addListener('onContextCreated', listener);
		return {
			dispose: () => {
				this.event.removeListener('onContextCreated', listener);
			},
		};
	}

	onSettingsChanged(listener: (setiings: ResolvedSettings) => void) {
		this.event.addListener('onSettingsChanged', listener);
		return {
			dispose: () => {
				this.event.removeListener('onSettingsChanged', listener);
			},
		};
	}

	getAllowedActions(location: TextDocumentPositionParams) {
		return this.client.sendRequest(
			'devicetree/customActions',
			location,
		) as Promise<Actions[]>;
	}

	setActiveFileUri(path: string) {
		return this.client.sendRequest(
			'devicetree/activeFileUri',
			path,
		) as Promise<void>;
	}

	evaluateMacros(macros: string[], ctxId: string) {
		return this.client.sendRequest('devicetree/evalMacros', {
			macros,
			ctxId,
		}) as Promise<EvaluatedMacro[]>;
	}

	getMemoryViews(ctxId: string) {
		return this.client.sendRequest('devicetree/memoryViews', {
			ctxId,
		}) as Promise<unknown[]>;
	}

	getZephyrTypeBindings(id: string) {
		return this.client.sendRequest(
			'devicetree/zephyrTypeBindings',
			id,
		) as Promise<ZephyrBindingYml[] | undefined>;
	}

	getMacroNames(id: string) {
		return this.client.sendRequest(
			'devicetree/contextMacroNames',
			id,
		) as Promise<string[] | undefined>;
	}

	getLocationScpoedInformation(
		event: TextDocumentPositionParams & { id: string },
	) {
		return this.client.sendRequest(
			'devicetree/locationScopeInformation',
			event,
		) as Promise<PositionScopeInformation | undefined>;
	}
}
