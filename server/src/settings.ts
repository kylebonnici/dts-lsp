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

import { basename, resolve } from "path";
import { Context, PartialBy, ResolvedContext, Settings } from "./types/index";
import { generateContextId } from "./helpers";

const resolvePathVariable = async (
  path: string,
  rootWorkspace?: string
): Promise<string> => {
  if (rootWorkspace) {
    path = path.replaceAll("${workspaceFolder}", rootWorkspace);
  }
  return path;
};

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
export type ResolvedSettings = PartialBy<
  Required<Settings>,
  "cwd" | "preferredContext" | "defaultBindingType"
>;

export const defaultSettings: ResolvedSettings = {
  defaultBindingType: "Zephyr",
  defaultZephyrBindings: [],
  defaultIncludePaths: [],
  defaultDeviceOrgBindingsMetaSchema: [],
  defaultDeviceOrgTreeBindings: [],
  contexts: [],
  defaultLockRenameEdits: [],
  allowAdhocContexts: true,
  autoChangeContext: true,
};

export const resolveContextSetting = (
  context: Context,
  defaultSettings: PartialBy<ResolvedSettings, "contexts">
): ResolvedContext => {
  const cwd = context.cwd ?? defaultSettings.cwd;
  let includePaths =
    context.includePaths ?? defaultSettings.defaultIncludePaths;
  let zephyrBindings =
    context.zephyrBindings ?? defaultSettings.defaultZephyrBindings;
  const bindingType = context.bindingType ?? defaultSettings.defaultBindingType;
  let deviceOrgTreeBindings =
    context.deviceOrgTreeBindings ??
    defaultSettings.defaultDeviceOrgTreeBindings;
  let deviceOrgBindingsMetaSchema =
    context.deviceOrgBindingsMetaSchema ??
    defaultSettings.defaultDeviceOrgBindingsMetaSchema;

  if (
    bindingType === "Zephyr" &&
    (!zephyrBindings || zephyrBindings.length === 0)
  ) {
    zephyrBindings = ["./zephyr/dts/bindings"];
  }

  let dtsFile = context.dtsFile;
  let overlays = context.overlays ?? [];

  if (cwd) {
    zephyrBindings = zephyrBindings.map((i) => resolve(cwd, i));
    deviceOrgTreeBindings = deviceOrgTreeBindings?.map((i) => resolve(cwd, i));
    deviceOrgBindingsMetaSchema = deviceOrgBindingsMetaSchema.map((i) =>
      resolve(cwd, i)
    );
    includePaths = includePaths.map((i) => resolve(cwd, i));
    dtsFile = resolve(cwd, dtsFile);
    overlays = overlays.map((overlay) => resolve(cwd, overlay));
  }

  return {
    ctxName: context.ctxName ?? basename(dtsFile),
    cwd,
    includePaths,
    zephyrBindings,
    bindingType,
    deviceOrgTreeBindings,
    deviceOrgBindingsMetaSchema,
    dtsFile,
    overlays,
  };
};

export const resolveSettings = async (
  globalSettings: Settings,
  rootWorkspace?: string
): Promise<ResolvedSettings> => {
  const cwd = globalSettings.cwd
    ? await resolvePathVariable(globalSettings.cwd, rootWorkspace)
    : undefined;

  const defaultBindingType = globalSettings.defaultBindingType;
  let defaultDeviceOrgBindingsMetaSchema =
    (globalSettings.defaultDeviceOrgBindingsMetaSchema = await Promise.all(
      (globalSettings.defaultDeviceOrgBindingsMetaSchema ?? []).map((v) =>
        resolvePathVariable(v, rootWorkspace)
      )
    ));
  const defaultDeviceOrgTreeBindings =
    (globalSettings.defaultDeviceOrgTreeBindings = await Promise.all(
      (globalSettings.defaultDeviceOrgTreeBindings ?? []).map((v) =>
        resolvePathVariable(v, rootWorkspace)
      )
    ));

  let defaultIncludePaths = (globalSettings.defaultIncludePaths =
    await Promise.all(
      (globalSettings.defaultIncludePaths ?? []).map((v) =>
        resolvePathVariable(v, rootWorkspace)
      )
    ));
  let defaultZephyrBindings = (globalSettings.defaultZephyrBindings =
    await Promise.all(
      (globalSettings.defaultZephyrBindings ?? []).map((v) =>
        resolvePathVariable(v, rootWorkspace)
      )
    ));
  const defaultLockRenameEdits = (globalSettings.defaultLockRenameEdits =
    await Promise.all(
      (globalSettings.defaultLockRenameEdits ?? []).map((v) =>
        resolvePathVariable(v, rootWorkspace)
      )
    ));

  if (cwd) {
    // resolve global with cwd
    defaultIncludePaths = globalSettings.defaultIncludePaths = (
      globalSettings.defaultIncludePaths ?? []
    ).map((i) => resolve(cwd, i));

    if (
      defaultBindingType === "Zephyr" &&
      !globalSettings.defaultZephyrBindings
    ) {
      defaultZephyrBindings = ["./zephyr/dts/bindings"];
    }

    defaultZephyrBindings = defaultZephyrBindings.map((i) => resolve(cwd, i));

    defaultDeviceOrgBindingsMetaSchema = defaultDeviceOrgBindingsMetaSchema.map(
      (i) => resolve(cwd, i)
    );
  }

  globalSettings.defaultDeviceOrgTreeBindings = (
    globalSettings.defaultDeviceOrgTreeBindings ?? []
  ).map((i) => {
    if (globalSettings.cwd) {
      return resolve(globalSettings.cwd, i);
    }

    return i;
  });

  const resolvedGlobalSettings: PartialBy<ResolvedSettings, "contexts"> = {
    cwd,
    defaultDeviceOrgBindingsMetaSchema,
    defaultDeviceOrgTreeBindings,
    defaultIncludePaths,
    defaultZephyrBindings,
    defaultLockRenameEdits,
    defaultBindingType,
    autoChangeContext:
      globalSettings.autoChangeContext ?? defaultSettings.autoChangeContext,
    allowAdhocContexts:
      globalSettings.allowAdhocContexts ?? defaultSettings.allowAdhocContexts,
  };

  const resolvedContextMap = new Map<string, ResolvedContext>();

  (
    globalSettings.contexts?.map((ctx) =>
      resolveContextSetting(ctx, resolvedGlobalSettings)
    ) ?? []
  ).forEach((ctx) => {
    resolvedContextMap.set(generateContextId(ctx), ctx);
  });

  return {
    ...resolvedGlobalSettings,
    contexts: Array.from(resolvedContextMap.values()),
  };
};
