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
import { getReferences } from "../findReferences";
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
describe("Find references", () => {
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

    const references = await getReferences(location, [context]);
    expect(references).toEqual([]);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(4);
      expect(references[3].range.start.character).toEqual(2);
      expect(references[3].range.end.character).toEqual(7);

      expect(references[2].range.start.character).toEqual(14);
      expect(references[2].range.end.character).toEqual(19);

      expect(references[1].range.start.character).toEqual(24);
      expect(references[1].range.end.character).toEqual(29);

      expect(references[0].range.start.character).toEqual(36);
      expect(references[0].range.end.character).toEqual(41);
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

      let references = await getReferences(location1, [context]);
      expect(references.length).toEqual(2);

      expect(references[1].range.start.character).toEqual(22);
      expect(references[1].range.end.character).toEqual(27);

      expect(references[0].range.start.character).toEqual(55);
      expect(references[0].range.end.character).toEqual(60);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 45),
      };

      references = await getReferences(location2, [context]);
      expect(references.length).toEqual(2);
      expect(references[1].range.start.character).toEqual(9);
      expect(references[1].range.end.character).toEqual(14);

      expect(references[0].range.start.character).toEqual(42);
      expect(references[0].range.end.character).toEqual(47);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(1);
      expect(references[0].range.start.character).toEqual(79);
      expect(references[0].range.end.character).toEqual(84);
    });

    test("with in deleted node", async () => {
      mockReadFileSync("/{ l1: node1{prop1; prop1;};}; /delete-node/ &l1;");
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
        position: Position.create(0, 23),
      };

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(2);
      expect(references[1].range.start.character).toEqual(13);
      expect(references[1].range.end.character).toEqual(18);

      expect(references[0].range.start.character).toEqual(20);
      expect(references[0].range.end.character).toEqual(25);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(3);
      expect(references[0].range.start.character).toEqual(12);
      expect(references[0].range.end.character).toEqual(17);

      expect(references[1].range.start.character).toEqual(2);
      expect(references[1].range.end.character).toEqual(7);

      expect(references[2].range.start.character).toEqual(37);
      expect(references[2].range.end.character).toEqual(42);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(10);
      expect(references[0].range.end.character).toEqual(15);

      expect(references[1].range.start.character).toEqual(29);
      expect(references[1].range.end.character).toEqual(34);
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

      let references = await getReferences(location1, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(9);
      expect(references[0].range.end.character).toEqual(14);

      expect(references[1].range.start.character).toEqual(30);
      expect(references[1].range.end.character).toEqual(35);

      const location2: TextDocumentPositionParams = {
        textDocument,
        position: Position.create(0, 26),
      };

      references = await getReferences(location2, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(3);
      expect(references[0].range.end.character).toEqual(8);

      expect(references[1].range.start.character).toEqual(24);
      expect(references[1].range.end.character).toEqual(29);
    });

    test("DTC child and ref node - 1", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
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
        position: Position.create(0, 9),
      };

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(17);
      expect(references[0].range.end.character).toEqual(19);

      expect(references[1].range.start.character).toEqual(6);
      expect(references[1].range.end.character).toEqual(11);
    });

    test("DTC child and ref node - 2", async () => {
      mockReadFileSync("/{l1: node1{};};&l1{};");
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
        position: Position.create(0, 18),
      };

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(17);
      expect(references[0].range.end.character).toEqual(19);

      expect(references[1].range.start.character).toEqual(6);
      expect(references[1].range.end.character).toEqual(11);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(1);
      expect(references[0].range.start.character).toEqual(54);
      expect(references[0].range.end.character).toEqual(59);
    });

    test("in deleted node", async () => {
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
        position: Position.create(0, 16),
      };

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(1);
      expect(references[0].range.start.character).toEqual(13);
      expect(references[0].range.end.character).toEqual(18);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(2);
      expect(references[0].range.start.character).toEqual(41);
      expect(references[0].range.end.character).toEqual(43);

      expect(references[1].range.start.character).toEqual(7);
      expect(references[1].range.end.character).toEqual(12);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(3);
      expect(references[0].range.start.character).toEqual(7);
      expect(references[0].range.end.character).toEqual(12);

      expect(references[1].range.start.character).toEqual(29);
      expect(references[1].range.end.character).toEqual(34);

      expect(references[2].range.start.character).toEqual(60);
      expect(references[2].range.end.character).toEqual(65);
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

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(3);
      expect(references[0].range.start.character).toEqual(49);
      expect(references[0].range.end.character).toEqual(51);

      expect(references[1].range.start.character).toEqual(7);
      expect(references[1].range.end.character).toEqual(12);

      expect(references[2].range.start.character).toEqual(29);
      expect(references[2].range.end.character).toEqual(34);
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
        position: Position.create(0, 53),
      };

      const references = await getReferences(location, [context]);
      expect(references.length).toEqual(3);
      expect(references[0].range.start.character).toEqual(51);
      expect(references[0].range.end.character).toEqual(56);

      expect(references[1].range.start.character).toEqual(7);
      expect(references[1].range.end.character).toEqual(12);

      expect(references[2].range.start.character).toEqual(29);
      expect(references[2].range.end.character).toEqual(34);
    });
  });
});
