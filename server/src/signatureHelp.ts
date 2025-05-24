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

import { SignatureHelp, SignatureHelpParams } from "vscode-languageserver";
import { nodeFinder } from "./helpers";
import { ContextAware } from "./runtimeEvaluator";
import { SearchableResult } from "./types";
import { Property } from "./context/property";

function getPropertySignatureHelp(
  result: SearchableResult | undefined,
  context: ContextAware
): SignatureHelp | undefined {
  if (!result || !(result.item instanceof Property)) {
    return;
  }

  const signatureHelp = result.item.parent.nodeType?.getSignatureHelp?.(
    result.item,
    result.ast,
    result.beforeAst,
    result.afterAst
  );

  return signatureHelp;
}

export async function getSignatureHelp(
  location: SignatureHelpParams,
  context: ContextAware | undefined
): Promise<SignatureHelp | undefined> {
  if (!context) return;

  return (
    await nodeFinder(location, context, async (locationMeta) => [
      getPropertySignatureHelp(locationMeta, context),
    ])
  ).at(0);
}
