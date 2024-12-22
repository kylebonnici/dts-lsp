/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
import { ContextAware } from "../runtimeEvaluator";
import { getCompletions } from "../getCompletions";
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
describe("Find complitions", () => {
  beforeEach(() => {
    resetTokenizedDocmentProvider();
  });

  test("No complitions to find", async () => {
    mockReadFileSync("/{prop1;prop2;prop1;};    /{prop1;prop2;prop1;};");
    const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
    const context = new ContextAware(textDocument.uri, [], []);
    await context.parser.stable;

    const location: TextDocumentPositionParams = {
      textDocument,
      position: Position.create(0, 24),
    };

    const complitions = await getCompletions(location, [context]);
    expect(complitions).toEqual([]);
  });

  describe("Properties", () => {
    describe("Delete", () => {
      test("Before props", async () => {
        mockReadFileSync("/{/delete-property/ p;prop1;prop2;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 21),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions).toEqual([]);
      });

      test("Between props", async () => {
        mockReadFileSync("/{prop1;/delete-property/ p;prop2;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 27),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("prop1");
      });

      test("after props", async () => {
        mockReadFileSync("/{prop1;prop2;/delete-property/ p;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 33),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("prop1");
        expect(complitions[1].label).toEqual("prop2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{prop1;prop2;/delete-property/ prop1;/delete-property/ p;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 57),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("prop2");
      });

      test("Before delete statmente", async () => {
        mockReadFileSync(
          "/{prop1;prop2;/delete-property/ ;/delete-property/ prop1;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 32),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("prop2");
        expect(complitions[1].label).toEqual("prop1");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{prop1;prop2;/};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 15),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-property/");
      });
    });

    describe("Values", () => {
      test("No label ref", async () => {
        mockReadFileSync("/{prop1=&;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 9),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(0);
      });

      test("Exists label ref", async () => {
        mockReadFileSync("/{l1: node{};prop1=&;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 20),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("l1");
      });

      test("Exists array value with label ref", async () => {
        mockReadFileSync("/{l1: node{};prop1=<&>;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 21),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("l1");
      });

      test("No node path ref", async () => {
        mockReadFileSync("/{prop1=&{/};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 11),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(0);
      });

      test("Exists node path ref", async () => {
        mockReadFileSync("/{node{};prop1=&{/};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 18),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/node");
      });

      test("Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};prop1=<&{/}>;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 19),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/node");
      });

      test("Before delete Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};prop1=<&{/}>;/delete-node/ node;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 19),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/node");
      });

      test("After delete Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};/delete-node/ node; prop1=<&{/}>;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 39),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(0);
      });
    });
  });

  describe("Node", () => {
    describe("Create ref node", () => {
      test("Before node", async () => {
        mockReadFileSync("& /{l1: node1{}; l2: node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 1),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{l1: node1{};} & /{l2: node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 17),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("l1");
      });

      test("after props", async () => {
        mockReadFileSync("/{l1: node1{};} /{l2: node2{};}; &");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 34),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("l1");
        expect(complitions[1].label).toEqual("l2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 52),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("node2");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 19),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-node/");
      });
    });
    describe("Delete node name", () => {
      test("Before node", async () => {
        mockReadFileSync("/{/delete-node/ ;node1{};node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 16),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{node1{};/delete-node/ ;node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 24),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("node1");
      });

      test("after props", async () => {
        mockReadFileSync("/{node1{};node2{};/delete-node/ ;};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 32),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("node1");
        expect(complitions[1].label).toEqual("node2");
      });

      test("after deleted node", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 52),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("node2");
      });

      test("delete keyword in node", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 19),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-node/");
      });

      test("delete keyword in root doc no labels", async () => {
        mockReadFileSync("/{node1{};node2{};}; /");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 22),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-node/ &{}");
      });

      test("delete keyword in root doc with labels", async () => {
        mockReadFileSync("/{l1: node1{}; l2: node2{};}; /");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 31),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-node/");
      });

      test("before deleted statement", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ ;/delete-node/ node1;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 32),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("node2");
        expect(complitions[1].label).toEqual("node1");
      });
    });

    describe("Delete node path", () => {
      test("Before node", async () => {
        mockReadFileSync("/delete-node/ &{/};/{node1{};};/{node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 17),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{node1{};}; /delete-node/ &{/}; /{node2{};};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 30),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/node1");
      });

      test("after props", async () => {
        mockReadFileSync("/{node1{};}; /{node2{};};  /delete-node/ &{/};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 44),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(2);
        expect(complitions[0].label).toEqual("/node1");
        expect(complitions[1].label).toEqual("/node2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
        );
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 52),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("node2");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
        const textDocument: TextDocumentIdentifier = { uri: "/folder/dts.dts" };
        const context = new ContextAware(textDocument.uri, [], []);
        await context.parser.stable;

        const location: TextDocumentPositionParams = {
          textDocument,
          position: Position.create(0, 19),
        };

        const complitions = await getCompletions(location, [context]);
        expect(complitions.length).toEqual(1);
        expect(complitions[0].label).toEqual("/delete-node/");
      });
    });
  });
});
