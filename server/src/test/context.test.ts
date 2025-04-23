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
import { ContextIssues } from "../types";
import { getFakeBindingLoader } from "./helpers";

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

describe("Context Issues", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  test("Duplicate property name", async () => {
    mockReadFileSync("/{prop1;prop1;cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([
      ContextIssues.DUPLICATE_PROPERTY_NAME,
    ]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(8);

    expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(8);
    expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(14);
  });

  test("Delete non existing property", async () => {
    mockReadFileSync("/{/delete-property/ prop1; cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([
      ContextIssues.PROPERTY_DOES_NOT_EXIST,
    ]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(20);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(25);
  });

  test("Delete property before create", async () => {
    mockReadFileSync("/{/delete-property/ prop1; prop1; cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([
      ContextIssues.PROPERTY_DOES_NOT_EXIST,
    ]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(20);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(25);
  });

  test("Duplicate node name no address in node", async () => {
    mockReadFileSync("/{node{};node{};cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.DUPLICATE_NODE_NAME]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(9);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(13);
  });

  test("Duplicate node name with address in node", async () => {
    mockReadFileSync("/{node@20{};node@20{};cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.DUPLICATE_NODE_NAME]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(12);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(19);
  });

  test("Duplicate node name with address coma separated in node", async () => {
    mockReadFileSync("/{node@20,30{};node@20,30{};cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.DUPLICATE_NODE_NAME]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(15);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(25);
  });

  describe("Unable to resolve node name", () => {
    test("prop with invalid ref", async () => {
      mockReadFileSync("/{prop1=&l1; cpus{};memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);

      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(8);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(11);
    });
    test("Node Ref", async () => {
      mockReadFileSync("&nodeLabel{}; /{cpus{};memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(10);
    });

    test("Reference deleted Node with ref", async () => {
      mockReadFileSync(
        "/{l1: node1 {}; cpus{};memory{};}; /delete-node/ &l1; &l1{};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);

      expect(issues[1].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[1].raw.astElement.firstToken.pos.col).toEqual(54);
      expect(issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(57);
    });

    test("Reference deleted Node with name", async () => {
      mockReadFileSync(
        "/{l1: node1{}; /delete-node/ node1; cpus{};memory{};}; &l1{};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);

      expect(issues[1].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[1].raw.astElement.firstToken.pos.col).toEqual(55);
      expect(issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(58);
    });

    test("Delete Node with Ref", async () => {
      mockReadFileSync("/delete-node/ &nodeLabel; /{cpus{};memory{};}");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(14);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(24);
    });
  });

  test("Duplicate label use", async () => {
    mockReadFileSync("/{l1: node1{}; l1: node2{};cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.LABEL_ALREADY_IN_USE]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(5);

    expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(15);
    expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(18);
  });

  test("Delete non existing node", async () => {
    mockReadFileSync("/{/delete-node/ node; cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.NODE_DOES_NOT_EXIST]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(16);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(20);
  });

  test("Delete node before created node", async () => {
    mockReadFileSync("/{/delete-node/ node; node{};cpus{};memory{};};");
    const context = new ContextAware(
      { dtsFile: "file:///folder/dts.dts" },
      getFakeBindingLoader()
    );
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].raw.issues).toEqual([ContextIssues.NODE_DOES_NOT_EXIST]);
    expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(16);
    expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(20);
  });

  describe("delete ui", () => {
    test("Delete property", async () => {
      mockReadFileSync(
        "/{node {prop1; /delete-property/ prop1;}; cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(8);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(14);
    });

    test("Delete from two nodes property", async () => {
      mockReadFileSync(
        "/{node {prop1;}};/{node {prop1; /delete-property/ prop1;};cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(3);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(25);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(31);

      expect(issues[1].raw.issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[1].raw.astElement.firstToken.pos.col).toEqual(8);
      expect(issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(14);

      expect(issues[2].raw.issues).toEqual([
        ContextIssues.DUPLICATE_PROPERTY_NAME,
      ]);
      expect(issues[2].raw.astElement.firstToken.pos.col).toEqual(8);
      expect(issues[2].raw.astElement.lastToken.pos.colEnd).toEqual(14);
    });

    test("Delete Node with name no address", async () => {
      mockReadFileSync("/{node {}; /delete-node/ node; cpus{};memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(10);

      expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(11);
      expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(30);
    });

    test("Delete Node with name with address", async () => {
      mockReadFileSync(
        "/{node@200 {}; node@300 {}; /delete-node/ node@300;cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(15);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(27);
    });

    test("Delete Node with label ref", async () => {
      mockReadFileSync("/{l1: node {}; cpus{};memory{};};  /delete-node/ &l1;");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(14);
    });

    test("Delete Node with path", async () => {
      mockReadFileSync(
        "/{l1: node1 {node2 {};};cpus{};memory{};};  /delete-node/ &{/node1/node2};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(13);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(22);
    });

    test("Delete multiple Node", async () => {
      mockReadFileSync(
        "/{node {};};/{node {}; /delete-node/ node cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(10);
      expect(issues[1].raw.issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[1].raw.astElement.firstToken.pos.col).toEqual(14);
      expect(issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(22);
    });
  });

  describe("Resolve node path", () => {
    test("Delete node with path not existing", async () => {
      mockReadFileSync(
        "/{node1{};cpus{};memory{};};/delete-node/ &{/node1/node2};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(51);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(56);
      expect(issues[0].raw.templateStrings).toEqual(["node2", "node1"]);
    });

    test("property array node part ref values", async () => {
      mockReadFileSync(
        "/{node1{};}; /{prop1=<&{/node1/node2}>;cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(31);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(36);
      expect(issues[0].raw.templateStrings).toEqual(["node2", "node1"]);
    });

    test("property node path ref", async () => {
      mockReadFileSync(
        "/{node1{};}; /{prop1=&{/node1/node2};cpus{};memory{};};"
      );
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(30);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(35);
      expect(issues[0].raw.templateStrings).toEqual(["node2", "node1"]);
    });
  });

  describe("Resolve label ref", () => {
    test("Delete node with path not existing", async () => {
      mockReadFileSync("/{l1: node1{};cpus{};memory{};};/delete-node/ &l2;");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(46);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(49);
      expect(issues[0].raw.templateStrings).toEqual(["l2"]);
    });

    test("property array label ref value", async () => {
      mockReadFileSync("/{l1: node1{};}; /{prop1=<&l2>;cpus{};memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(26);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(29);
      expect(issues[0].raw.templateStrings).toEqual(["l2"]);
    });

    test("property node path ref", async () => {
      mockReadFileSync("/{l1: node1{};}; /{prop1=&l2;cpus{};memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(25);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(28);
      expect(issues[0].raw.templateStrings).toEqual(["l2"]);
    });
  });

  describe("Mandatory Nodes", () => {
    test("missing cpus", async () => {
      mockReadFileSync("/{memory{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.MISSING_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(13);
      expect(issues[0].raw.templateStrings).toEqual(["/", "cpus"]);
    });

    test.skip("missing memory", async () => {
      mockReadFileSync("/{cpus{};};");
      const context = new ContextAware(
        { dtsFile: "file:///folder/dts.dts" },
        getFakeBindingLoader()
      );
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].raw.issues).toEqual([ContextIssues.MISSING_NODE]);
      expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(11);
      expect(issues[0].raw.templateStrings).toEqual(["/", "memory"]);
    });
  });
});
