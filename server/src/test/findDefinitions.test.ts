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
import { getDefinitions } from "../findDefinitions";
import {
  Position,
  TextDocumentIdentifier,
  TextDocumentPositionParams,
} from "vscode-languageserver";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockImplementation(() => {
    throw new Error("readFileSync - Not mocked");
  }),
  existsSync: jest.fn().mockImplementation(() => {
    throw new Error("existsSync - Not mocked");
  }),
}));

const mockReadFileSync = (content: string, path?: string) => {
  (fs.readFileSync as unknown as jest.Mock).mockImplementation(() => {
    return content;
  });
};
describe("Find definitions", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  test("No definition to find", async () => {
    mockReadFileSync("/{prop1;prop2;prop1;};    /{prop1;prop2;prop1;};");
    const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
    const context = new ContextAware(textDocument.uri, [], []);
    await context.parser.stable;

    const location: TextDocumentPositionParams = {
      textDocument,
      position: Position.create(0, 24),
    };

    const declarations = await getDefinitions(location, [context]);
    expect(declarations).toEqual([]);
  });

  describe("Properties", () => {
    test("Duplicate property name same level", async () => {
      mockReadFileSync("/{prop1;prop2;prop1;};/{prop1;prop2;prop1;};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 37),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(4);
      expect(declarations[3].range.start.character).toEqual(2);
      expect(declarations[3].range.end.character).toEqual(7);

      expect(declarations[2].range.start.character).toEqual(14);
      expect(declarations[2].range.end.character).toEqual(19);

      expect(declarations[1].range.start.character).toEqual(24);
      expect(declarations[1].range.end.character).toEqual(29);

      expect(declarations[0].range.start.character).toEqual(36);
      expect(declarations[0].range.end.character).toEqual(41);
    });

    test("Duplicate property name different level", async () => {
      mockReadFileSync(
        "/{ node1{prop1; node1{prop1;}};};/{ node1{prop1; node1{prop1;}};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location1: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 57),
      };

      let declarations = await getDefinitions(location1, [context]);
      expect(declarations.length).toEqual(2);

      expect(declarations[1].range.start.character).toEqual(22);
      expect(declarations[1].range.end.character).toEqual(27);

      expect(declarations[0].range.start.character).toEqual(55);
      expect(declarations[0].range.end.character).toEqual(60);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 45),
      };

      declarations = await getDefinitions(location2, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[1].range.start.character).toEqual(9);
      expect(declarations[1].range.end.character).toEqual(14);

      expect(declarations[0].range.start.character).toEqual(42);
      expect(declarations[0].range.end.character).toEqual(47);
    });

    test("with deleted node", async () => {
      mockReadFileSync(
        "/{ l1: node1{prop1; node1{prop1;}};}; /delete-node/ &l1; /{ node1{prop1; node1{prop1;}};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 82),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(1);
      expect(declarations[0].range.start.character).toEqual(79);
      expect(declarations[0].range.end.character).toEqual(84);
    });

    test("with in deleted node", async () => {
      mockReadFileSync("/{ l1: node1{prop1; prop1;};}; /delete-node/ &l1;");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 23),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[1].range.start.character).toEqual(13);
      expect(declarations[1].range.end.character).toEqual(18);

      expect(declarations[0].range.start.character).toEqual(20);
      expect(declarations[0].range.end.character).toEqual(25);
    });

    test("Delete property", async () => {
      mockReadFileSync("/{prop1;};/{prop1; /delete-property/ prop1;};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 39),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(12);
      expect(declarations[0].range.end.character).toEqual(17);

      expect(declarations[1].range.start.character).toEqual(2);
      expect(declarations[1].range.end.character).toEqual(7);
    });
  });

  describe("Nodes", () => {
    test("Duplicate node name same level", async () => {
      mockReadFileSync("/{node1{};node2{}};/{node1{};node2{};};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 31),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(10);
      expect(declarations[0].range.end.character).toEqual(17);

      expect(declarations[1].range.start.character).toEqual(29);
      expect(declarations[1].range.end.character).toEqual(37);
    });

    test("Duplicate node name different level", async () => {
      mockReadFileSync("/{ node1{node1{};};};/{ node1{node1{};};};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location1: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 32),
      };

      let declarations = await getDefinitions(location1, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(9);
      expect(declarations[0].range.end.character).toEqual(17);

      expect(declarations[1].range.start.character).toEqual(30);
      expect(declarations[1].range.end.character).toEqual(38);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 26),
      };

      declarations = await getDefinitions(location2, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(3);
      expect(declarations[0].range.end.character).toEqual(19);

      expect(declarations[1].range.start.character).toEqual(24);
      expect(declarations[1].range.end.character).toEqual(40);
    });

    test("DTC child and ref node - 1", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 9),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(2);
      expect(declarations[0].range.end.character).toEqual(14);

      expect(declarations[1].range.start.character).toEqual(16);
      expect(declarations[1].range.end.character).toEqual(22);
    });

    test("DTC child and ref node - 2", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 18),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(2);
      expect(declarations[0].range.end.character).toEqual(14);

      expect(declarations[1].range.start.character).toEqual(16);
      expect(declarations[1].range.end.character).toEqual(22);
    });

    test("with deleted node", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /delete-node/ &l1; /{ node1{node1{};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 57),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(1);
      expect(declarations[0].range.start.character).toEqual(54);
      expect(declarations[0].range.end.character).toEqual(62);
    });

    test("in deleted node", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /delete-node/ &l1; /{ node1{node1{};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 16),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(1);
      expect(declarations[0].range.start.character).toEqual(13);
      expect(declarations[0].range.end.character).toEqual(21);
    });

    test("Delete node label", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /delete-node/ &l1; /{ node1{node1{};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 42),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(1);
      expect(declarations[0].range.start.character).toEqual(3);
      expect(declarations[0].range.end.character).toEqual(23);
    });

    test("Delete node name", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{};}; /delete-node/ node1;};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 62),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(3);
      expect(declarations[0].range.end.character).toEqual(23);

      expect(declarations[1].range.start.character).toEqual(29);
      expect(declarations[1].range.end.character).toEqual(45);
    });

    test("From property label", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{ prop1=&l1};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 50),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(3);
      expect(declarations[0].range.end.character).toEqual(23);

      expect(declarations[1].range.start.character).toEqual(29);
      expect(declarations[1].range.end.character).toEqual(55);
    });

    test("From property node path", async () => {
      mockReadFileSync(
        "/{ l1: node1{node1{};};}; /{ node1{node1{ prop1=&{/node1/node1}};};};"
      );
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 59),
      };

      const declarations = await getDefinitions(location, [context]);
      expect(declarations.length).toEqual(2);
      expect(declarations[0].range.start.character).toEqual(13);
      expect(declarations[0].range.end.character).toEqual(21);

      expect(declarations[1].range.start.character).toEqual(35);
      expect(declarations[1].range.end.character).toEqual(65);
    });
  });
});
