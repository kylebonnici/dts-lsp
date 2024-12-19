/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
import { ContextAware } from "../runtimeEvaluator";
import { getDefinitions } from "../findDefinitons";
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
    resetTokenizedDocmentProvider();
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

    const declerations = await getDefinitions(location, [context]);
    expect(declerations).toEqual([]);
  });

  describe("Properties", () => {
    test("Duplicate propety name samle level", async () => {
      mockReadFileSync("/{prop1;prop2;prop1;};/{prop1;prop2;prop1;};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 37),
      };

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(4);
      expect(declerations[3].range.start.character).toEqual(2);
      expect(declerations[3].range.end.character).toEqual(7);

      expect(declerations[2].range.start.character).toEqual(14);
      expect(declerations[2].range.end.character).toEqual(19);

      expect(declerations[1].range.start.character).toEqual(24);
      expect(declerations[1].range.end.character).toEqual(29);

      expect(declerations[0].range.start.character).toEqual(36);
      expect(declerations[0].range.end.character).toEqual(41);
    });

    test("Duplicate propety name different level", async () => {
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

      let declerations = await getDefinitions(location1, [context]);
      expect(declerations.length).toEqual(2);

      expect(declerations[1].range.start.character).toEqual(22);
      expect(declerations[1].range.end.character).toEqual(27);

      expect(declerations[0].range.start.character).toEqual(55);
      expect(declerations[0].range.end.character).toEqual(60);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 45),
      };

      declerations = await getDefinitions(location2, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[1].range.start.character).toEqual(9);
      expect(declerations[1].range.end.character).toEqual(14);

      expect(declerations[0].range.start.character).toEqual(42);
      expect(declerations[0].range.end.character).toEqual(47);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(1);
      expect(declerations[0].range.start.character).toEqual(79);
      expect(declerations[0].range.end.character).toEqual(84);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[1].range.start.character).toEqual(13);
      expect(declerations[1].range.end.character).toEqual(18);

      expect(declerations[0].range.start.character).toEqual(20);
      expect(declerations[0].range.end.character).toEqual(25);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(12);
      expect(declerations[0].range.end.character).toEqual(17);

      expect(declerations[1].range.start.character).toEqual(2);
      expect(declerations[1].range.end.character).toEqual(7);
    });
  });

  describe("Nodes", () => {
    test("Duplicate node name samle level", async () => {
      mockReadFileSync("/{node1{};node2{}};/{node1{};node2{};};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 31),
      };

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(10);
      expect(declerations[0].range.end.character).toEqual(17);

      expect(declerations[1].range.start.character).toEqual(29);
      expect(declerations[1].range.end.character).toEqual(37);
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

      let declerations = await getDefinitions(location1, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(9);
      expect(declerations[0].range.end.character).toEqual(17);

      expect(declerations[1].range.start.character).toEqual(30);
      expect(declerations[1].range.end.character).toEqual(38);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 26),
      };

      declerations = await getDefinitions(location2, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(3);
      expect(declerations[0].range.end.character).toEqual(19);

      expect(declerations[1].range.start.character).toEqual(24);
      expect(declerations[1].range.end.character).toEqual(40);
    });

    test("DTC child anre ref node - 1", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 9),
      };

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(2);
      expect(declerations[0].range.end.character).toEqual(14);

      expect(declerations[1].range.start.character).toEqual(16);
      expect(declerations[1].range.end.character).toEqual(22);
    });

    test("DTC child anre ref node - 2", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
      const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
      const context = new ContextAware(textDocument.uri, [], []);
      await context.parser.stable;

      const location: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 18),
      };

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(2);
      expect(declerations[0].range.end.character).toEqual(14);

      expect(declerations[1].range.start.character).toEqual(16);
      expect(declerations[1].range.end.character).toEqual(22);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(1);
      expect(declerations[0].range.start.character).toEqual(54);
      expect(declerations[0].range.end.character).toEqual(62);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(1);
      expect(declerations[0].range.start.character).toEqual(13);
      expect(declerations[0].range.end.character).toEqual(21);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(1);
      expect(declerations[0].range.start.character).toEqual(3);
      expect(declerations[0].range.end.character).toEqual(23);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(3);
      expect(declerations[0].range.end.character).toEqual(23);

      expect(declerations[1].range.start.character).toEqual(29);
      expect(declerations[1].range.end.character).toEqual(45);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(3);
      expect(declerations[0].range.end.character).toEqual(23);

      expect(declerations[1].range.start.character).toEqual(29);
      expect(declerations[1].range.end.character).toEqual(55);
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

      const declerations = await getDefinitions(location, [context]);
      expect(declerations.length).toEqual(2);
      expect(declerations[0].range.start.character).toEqual(13);
      expect(declerations[0].range.end.character).toEqual(21);

      expect(declerations[1].range.start.character).toEqual(35);
      expect(declerations[1].range.end.character).toEqual(65);
    });
  });
});
