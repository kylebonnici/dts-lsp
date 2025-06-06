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

import path, { basename, resolve } from "path";
import {
  Context,
  PartialBy,
  ResolvedContext,
  ResolvedSettings,
  Settings,
} from "./types/index";
import { existsSync } from "fs";
import { normalizePath } from "./helpers";

const fixToArray = <T>(a: T): T | undefined => {
  if (!a) return;
  return Array.isArray(a) ? a : ([a] as T);
};

const fixContextSettings = (context: Context): Context => {
  return {
    ...context,
    deviceOrgBindingsMetaSchema: fixToArray(
      context.deviceOrgBindingsMetaSchema
    ),
    deviceOrgTreeBindings: fixToArray(context.deviceOrgTreeBindings),
    includePaths: fixToArray(context.includePaths),
    lockRenameEdits: fixToArray(context.lockRenameEdits),
    zephyrBindings: fixToArray(context.zephyrBindings),
    overlays: fixToArray(context.overlays),
  };
};

export const fixSettingsTypes = (settings: Settings): Settings => {
  return {
    ...settings,
    defaultDeviceOrgBindingsMetaSchema: fixToArray(
      settings.defaultDeviceOrgBindingsMetaSchema
    ),
    defaultDeviceOrgTreeBindings: fixToArray(
      settings.defaultDeviceOrgTreeBindings
    ),
    defaultIncludePaths: fixToArray(settings.defaultIncludePaths),
    defaultLockRenameEdits: fixToArray(settings.defaultLockRenameEdits),
    defaultZephyrBindings: fixToArray(settings.defaultZephyrBindings),
    contexts: (settings.contexts as Context[] | undefined)?.map(
      fixContextSettings
    ) as ResolvedContext[] | undefined,
  };
};

const resolvePathVariable = async (
  path: string,
  rootWorkspace?: string
): Promise<string> => {
  if (rootWorkspace) {
    path = path.replaceAll("${workspaceFolder}", rootWorkspace);
  }
  return path;
};

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

export const resolveContextSetting = async (
  context: Context,
  defaultSettings: PartialBy<ResolvedSettings, "contexts">,
  rootWorkspace: string | undefined
): Promise<ResolvedContext> => {
  const cwd =
    (context.cwd
      ? await resolvePathVariable(context.cwd, rootWorkspace)
      : undefined) ?? defaultSettings.cwd;
  let includePaths = await Promise.all(
    (context.includePaths ?? defaultSettings.defaultIncludePaths).map((v) =>
      resolvePathVariable(v, rootWorkspace)
    )
  );
  let zephyrBindings = await Promise.all(
    (context.zephyrBindings ?? defaultSettings.defaultZephyrBindings).map((v) =>
      resolvePathVariable(v, rootWorkspace)
    )
  );
  const bindingType = context.bindingType ?? defaultSettings.defaultBindingType;
  let deviceOrgTreeBindings = await Promise.all(
    (
      context.deviceOrgTreeBindings ??
      defaultSettings.defaultDeviceOrgTreeBindings
    ).map((v) => resolvePathVariable(v, rootWorkspace))
  );
  let deviceOrgBindingsMetaSchema = await Promise.all(
    (
      context.deviceOrgBindingsMetaSchema ??
      defaultSettings.defaultDeviceOrgBindingsMetaSchema
    ).map((v) => resolvePathVariable(v, rootWorkspace))
  );
  let lockRenameEdits = await Promise.all(
    (context.lockRenameEdits ?? defaultSettings.defaultLockRenameEdits).map(
      (v) => resolvePathVariable(v, rootWorkspace)
    )
  );

  if (
    cwd &&
    bindingType === "Zephyr" &&
    (!zephyrBindings || zephyrBindings.length === 0)
  ) {
    zephyrBindings = ["./zephyr/dts/bindings"];
  }

  let dtsFile = context.dtsFile;
  let overlays = context.overlays ?? [];

  if (cwd) {
    zephyrBindings = zephyrBindings
      .map((i) => resolve(cwd, i))
      .filter((p) => existsSync(p));
    deviceOrgTreeBindings = deviceOrgTreeBindings?.map((i) => resolve(cwd, i));
    deviceOrgBindingsMetaSchema = deviceOrgBindingsMetaSchema.map((i) =>
      resolve(cwd, i)
    );
    includePaths = includePaths.map((i) => resolve(cwd, i));
    dtsFile = resolve(cwd, dtsFile);
    overlays = overlays.map((overlay) => resolve(cwd, overlay));
    lockRenameEdits = lockRenameEdits.map((lockRenameEdit) =>
      resolve(cwd, lockRenameEdit)
    );
  }

  return {
    ctxName: context.ctxName ?? basename(dtsFile),
    cwd: cwd ? normalizePath(cwd) : undefined,
    includePaths: includePaths.map(normalizePath),
    zephyrBindings: zephyrBindings.map(normalizePath),
    bindingType,
    deviceOrgTreeBindings: deviceOrgTreeBindings.map(normalizePath),
    deviceOrgBindingsMetaSchema: deviceOrgBindingsMetaSchema.map(normalizePath),
    dtsFile: normalizePath(dtsFile),
    overlays: overlays.map(normalizePath),
    lockRenameEdits: lockRenameEdits.map(normalizePath),
  };
};

export const resolveSettings = async (
  globalSettings: Settings,
  rootWorkspace: string | undefined
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
  let defaultDeviceOrgTreeBindings =
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
  let defaultLockRenameEdits = (globalSettings.defaultLockRenameEdits =
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

    defaultDeviceOrgTreeBindings = (
      globalSettings.defaultDeviceOrgTreeBindings ?? []
    ).map((i) => resolve(cwd, i));

    defaultLockRenameEdits = defaultLockRenameEdits.map((i) => resolve(cwd, i));
  }

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

  const contexts = (
    await Promise.all(
      globalSettings.contexts?.map((ctx) =>
        resolveContextSetting(ctx, resolvedGlobalSettings, rootWorkspace)
      ) ?? []
    )
  ).filter((c) =>
    [c.dtsFile, ...c.overlays].every((p) => existsSync(p) && path.isAbsolute(p))
  );

  return {
    ...resolvedGlobalSettings,
    contexts,
  };
};
