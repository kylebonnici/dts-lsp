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

import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { resetTokenizedDocumentProvider } from "../providers/tokenizedDocument";
import { ContextAware } from "../runtimeEvaluator";
import { getTypeCompletions } from "../getTypeCompletions";
import {
  Position,
  TextDocumentIdentifier,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { getFakeBindingLoader } from "./helpers";
import { fileURLToPath } from "url";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockImplementation(() => {
    throw new Error("readFileSync - Not mocked");
  }),
  existsSync: jest.fn().mockImplementation(() => {
    return true;
  }),
}));

const mockReadFileSync = (content: string, path?: string) => {
  (fs.readFileSync as unknown as jest.Mock).mockImplementation(() => {
    return content;
  });
};
describe("Find typed completions", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  describe("Properties", () => {
    test("status first string", async () => {
      mockReadFileSync("/{node{status= ;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 15),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(5);
      expect(completions[0].label).toEqual('"okay"');
      expect(completions[1].label).toEqual('"disabled"');
      expect(completions[2].label).toEqual('"reserved"');
      expect(completions[3].label).toEqual('"fail"');
      expect(completions[4].label).toEqual('"fail-sss"');
    });

    test("status second string", async () => {
      mockReadFileSync('/{node{status= "okay", ;};};');
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 23),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(0);
    });

    test("address-cells first value", async () => {
      mockReadFileSync("/{node{#address-cells= ;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 23),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(1);
      expect(completions[0].label).toEqual("<2>");
    });

    test("address-cells second value", async () => {
      mockReadFileSync("/{node{#address-cells= <10>,;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 28),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(0);
    });

    test("size-cells first value", async () => {
      mockReadFileSync("/{node{#size-cells= ;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 20),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(1);
      expect(completions[0].label).toEqual("<1>");
    });

    test("size-cells second value", async () => {
      mockReadFileSync("/{node{#size-cells= <10>,;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 25),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(0);
    });

    test("device_type - cpu", async () => {
      mockReadFileSync("/{cpu{device_type= ;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 19),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(1);
      expect(completions[0].label).toEqual('"cpu"');
    });

    test("device_type - memory", async () => {
      mockReadFileSync("/{memory{device_type= ;};};");
      const textDocument: TextDocumentIdentifier = {
        uri: "file:///folder/dts.dts",
      };
      const context = new ContextAware(
        fileURLToPath(textDocument.uri),
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 22),
      };

      const completions = await getTypeCompletions(location, [context]);
      expect(completions.length).toEqual(1);
      expect(completions[0].label).toEqual('"memory"');
    });
  });
});
