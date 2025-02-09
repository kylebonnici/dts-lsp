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
import { getDeclaration } from "../findDeclarations";
import {
  Position,
  TextDocumentIdentifier,
  TextDocumentPositionParams,
} from "vscode-languageserver";
import { Node } from "../context/node";
import { BindingLoader } from "../dtsTypes/bindings/bindingLoader";
import { getStandardType } from "../dtsTypes/standardTypes";

const getFakeBindingLoader = (): BindingLoader => ({
  getNodeTypes: (node: Node) => {
    return Promise.resolve([getStandardType()]);
  },
});

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
describe("Find Decleration", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  test("No definition to find", async () => {
    mockReadFileSync("/{prop1;prop2;prop1;};    /{prop1;prop2;prop1;};");
    const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
    const context = new ContextAware(
      textDocument.uri,
      [],
      getFakeBindingLoader(),
      []
    );
    await context.parser.stable;

    const location: TextDocumentPositionParams = {
      textDocument,
      position: Position.create(0, 24),
    };

    const decleration = await getDeclaration(location, [context]);
    expect(decleration).toBeUndefined();
  });

  describe("Properties", () => {
    test("Duplicate property name samle level", async () => {
      mockReadFileSync("/{prop1;prop2;prop1;};/{prop1;prop2;prop1;};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 37),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(2);
      expect(decleration?.range.end.character).toEqual(7);
    });

    test("Duplicate property name different level", async () => {
      mockReadFileSync(
        "/{ node1{prop1; node1{prop1;}};};/{ node1{prop1; node1{prop1;}};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location1: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 57),
      };

      let decleration = await getDeclaration(location1, [context]);
      expect(decleration?.range.start.character).toEqual(22);
      expect(decleration?.range.end.character).toEqual(27);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 45),
      };

      decleration = await getDeclaration(location2, [context]);
      expect(decleration?.range.start.character).toEqual(9);
      expect(decleration?.range.end.character).toEqual(14);
    });

    test("with deleted node", async () => {
      mockReadFileSync(
        "/{ l1: node1{prop1; node1{prop1;}};}; /delete-node/ &l1; /{ node1{prop1; node1{prop1;}};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 82),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(79);
      expect(decleration?.range.end.character).toEqual(84);
    });

    test("Delete property", async () => {
      mockReadFileSync("/{prop1;};/{prop1; /delete-property/ prop1;};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 39),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(2);
      expect(decleration?.range.end.character).toEqual(7);
    });
  });

  describe("Nodes", () => {
    test("Duplicate node name samle level", async () => {
      mockReadFileSync("/{node1{};node2{}};/{node1{};node2{};};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 31),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(10);
      expect(decleration?.range.end.character).toEqual(17);
    });

    test("Duplicate node name different level", async () => {
      mockReadFileSync("/{ node1{node1{};};};/{ node1{node1{};};};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location1: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 32),
      };

      let decleration = await getDeclaration(location1, [context]);
      expect(decleration?.range.start.character).toEqual(9);
      expect(decleration?.range.end.character).toEqual(17);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 26),
      };

      decleration = await getDeclaration(location2, [context]);
      expect(decleration?.range.start.character).toEqual(3);
      expect(decleration?.range.end.character).toEqual(19);
    });

    test("with deleted node", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /delete-node/ &l1; /{ node1{node1{};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 57),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(54);
      expect(decleration?.range.end.character).toEqual(62);
    });

    test("Delete node label", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /delete-node/ &l1; /{ node1{node1{};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 42),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(3);
      expect(decleration?.range.end.character).toEqual(23);
    });

    test("Delete node name", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{};}; /delete-node/ node1;};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 62),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(3);
      expect(decleration?.range.end.character).toEqual(23);
    });

    test("From property label", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{ prop1=&l1;};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 50),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(3);
      expect(decleration?.range.end.character).toEqual(23);
    });

    test("From property node path", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{ prop1=&{/node1/node1};};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(
        textDocument.uri,
        [],
        getFakeBindingLoader(),
        []
      );
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 59),
      };

      const decleration = await getDeclaration(location, [context]);
      expect(decleration?.range.start.character).toEqual(13);
      expect(decleration?.range.end.character).toEqual(21);
    });
  });
});
