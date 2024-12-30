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
import { getCompletions } from "../getCompletions";
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
    return [getStandardType()];
  },
});

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
describe("Find completions", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  test("No completions to find", async () => {
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

    const completions = await getCompletions(location, [context]);
    expect(completions).toEqual([]);
  });

  describe("Properties", () => {
    describe("Delete", () => {
      test("Before props", async () => {
        mockReadFileSync("/{/delete-property/ p;prop1;prop2;};");
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
          position: Position.create(0, 21),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions).toEqual([]);
      });

      test("Between props", async () => {
        mockReadFileSync("/{prop1;/delete-property/ p;prop2;};");
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
          position: Position.create(0, 27),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("prop1");
      });

      test("after props", async () => {
        mockReadFileSync("/{prop1;prop2;/delete-property/ p;};");
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
          position: Position.create(0, 33),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("prop1");
        expect(completions[1].label).toEqual("prop2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{prop1;prop2;/delete-property/ prop1;/delete-property/ p;};"
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("prop2");
      });

      test("Before delete statement", async () => {
        mockReadFileSync(
          "/{prop1;prop2;/delete-property/ ;/delete-property/ prop1;};"
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
          position: Position.create(0, 32),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("prop2");
        expect(completions[1].label).toEqual("prop1");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{prop1;prop2;/};");
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
          position: Position.create(0, 15),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-property/");
      });
    });

    describe("Values", () => {
      test("No label ref", async () => {
        mockReadFileSync("/{prop1=&;};");
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(0);
      });

      test("Exists label ref", async () => {
        mockReadFileSync("/{l1: node{};prop1=&;};");
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
          position: Position.create(0, 20),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("l1");
      });

      test("Exists array value with label ref", async () => {
        mockReadFileSync("/{l1: node{};prop1=<&>;};");
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
          position: Position.create(0, 21),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("l1");
      });

      test("No node path ref", async () => {
        mockReadFileSync("/{prop1=&{/};};");
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
          position: Position.create(0, 11),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(0);
      });

      test("Exists node path ref", async () => {
        mockReadFileSync("/{node{};prop1=&{/};};");
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/node");
      });

      test("Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};prop1=<&{/}>;};");
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
          position: Position.create(0, 19),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/node");
      });

      test("Before delete Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};prop1=<&{/}>;/delete-node/ node;};");
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
          position: Position.create(0, 19),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/node");
      });

      test("After delete Exists array value with node path ref", async () => {
        mockReadFileSync("/{node{};/delete-node/ node; prop1=<&{/}>;};");
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(0);
      });
    });
  });

  describe("Node", () => {
    describe("Create ref node", () => {
      test("Before node", async () => {
        mockReadFileSync("& /{l1: node1{}; l2: node2{};};");
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
          position: Position.create(0, 1),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{l1: node1{};} & /{l2: node2{};};");
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
          position: Position.create(0, 17),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("l1");
      });

      test("after props", async () => {
        mockReadFileSync("/{l1: node1{};} /{l2: node2{};}; &");
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
          position: Position.create(0, 34),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("l1");
        expect(completions[1].label).toEqual("l2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
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
          position: Position.create(0, 52),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("node2");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
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
          position: Position.create(0, 19),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-node/");
      });
    });
    describe("Delete node name", () => {
      test("Before node", async () => {
        mockReadFileSync("/{/delete-node/ ;node1{};node2{};};");
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

        const completions = await getCompletions(location, [context]);
        expect(completions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{node1{};/delete-node/ ;node2{};};");
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("node1");
      });

      test("after props", async () => {
        mockReadFileSync("/{node1{};node2{};/delete-node/ ;};");
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
          position: Position.create(0, 32),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("node1");
        expect(completions[1].label).toEqual("node2");
      });

      test("after deleted node", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
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
          position: Position.create(0, 52),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("node2");
      });

      test("delete keyword in node", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
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
          position: Position.create(0, 19),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-node/");
      });

      test("delete keyword in root doc no labels", async () => {
        mockReadFileSync("/{node1{};node2{};}; /");
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
          position: Position.create(0, 22),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-node/ &{}");
      });

      test("delete keyword in root doc with labels", async () => {
        mockReadFileSync("/{l1: node1{}; l2: node2{};}; /");
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

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-node/");
      });

      test("before deleted statement", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ ;/delete-node/ node1;};"
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
          position: Position.create(0, 32),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("node2");
        expect(completions[1].label).toEqual("node1");
      });
    });

    describe("Delete node path", () => {
      test("Before node", async () => {
        mockReadFileSync("/delete-node/ &{/};/{node1{};};/{node2{};};");
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
          position: Position.create(0, 17),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions).toEqual([]);
      });

      test("Between nodes", async () => {
        mockReadFileSync("/{node1{};}; /delete-node/ &{/}; /{node2{};};");
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
          position: Position.create(0, 30),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/node1");
      });

      test("after props", async () => {
        mockReadFileSync("/{node1{};}; /{node2{};};  /delete-node/ &{/};");
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
          position: Position.create(0, 44),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(2);
        expect(completions[0].label).toEqual("/node1");
        expect(completions[1].label).toEqual("/node2");
      });

      test("after deleted props", async () => {
        mockReadFileSync(
          "/{node1{};node2{};/delete-node/ node1;/delete-node/ ;};"
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
          position: Position.create(0, 52),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("node2");
      });

      test("delete keyword", async () => {
        mockReadFileSync("/{node1{};node2{};/};");
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
          position: Position.create(0, 19),
        };

        const completions = await getCompletions(location, [context]);
        expect(completions.length).toEqual(1);
        expect(completions[0].label).toEqual("/delete-node/");
      });
    });
  });
});
