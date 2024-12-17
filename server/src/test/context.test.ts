/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
import { ContextAware } from "../runtimeEvaluator";
import { ContextIssues } from "../types";

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
describe("Issues", () => {
  beforeEach(() => {
    resetTokenizedDocmentProvider();
  });

  test("Duplicate propety name", async () => {
    mockReadFileSync("/{prop1;prop1;};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.DUPLICATE_PROPERTY_NAME]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(2);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(8);

    expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(8);
    expect(
      issues[0].linkedTo[0].lastToken.pos.col +
        issues[0].linkedTo[0].lastToken.pos.len
    ).toEqual(14);
  });

  test("Delete non existing propety", async () => {
    mockReadFileSync("/{/delete-property/ prop1;};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.PROPERTY_DOES_NOT_EXIST]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(20);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(25);
  });

  test("Delete propety before create", async () => {
    mockReadFileSync("/{/delete-property/ prop1; prop1;};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.PROPERTY_DOES_NOT_EXIST]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(20);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(25);
  });

  test("Duplicate node name in node", async () => {
    mockReadFileSync("/{node{};node{}};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.DUPLICATE_NODE_NAME]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(9);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(13);
  });

  describe("Unable to resolve node name", () => {
    test("prop with invalid ref", async () => {
      mockReadFileSync("/{prop1=&l1};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);

      expect(issues[0].astElement.firstToken.pos.col).toEqual(8);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(11);
    });
    test("Node Ref", async () => {
      mockReadFileSync("&nodeLabel{};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(0);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(10);
    });

    test("Reference deleted Node with ref", async () => {
      mockReadFileSync("/{l1: node1 {};}; /delete-node/ &l1; &l1{};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);

      expect(issues[1].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[1].astElement.firstToken.pos.col).toEqual(37);
      expect(
        issues[1].astElement.lastToken.pos.col +
          issues[1].astElement.lastToken.pos.len
      ).toEqual(40);
    });

    test("Reference deleted Node with name", async () => {
      mockReadFileSync("/{l1: node1{}; /delete-node/ node1;}; &l1{};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);

      expect(issues[1].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[1].astElement.firstToken.pos.col).toEqual(38);
      expect(
        issues[1].astElement.lastToken.pos.col +
          issues[1].astElement.lastToken.pos.len
      ).toEqual(41);
    });

    test("Delete Node with Ref", async () => {
      mockReadFileSync("/delete-node/ &nodeLabel;");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(14);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(24);
    });
  });

  test("Duplicate label use", async () => {
    mockReadFileSync("/{l1: node1{}; l1: node2{}};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.LABEL_ALREADY_IN_USE]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(2);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(5);

    expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(15);
    expect(
      issues[0].linkedTo[0].lastToken.pos.col +
        issues[0].linkedTo[0].lastToken.pos.len
    ).toEqual(18);
  });

  test("Delete non existing node", async () => {
    mockReadFileSync("/{/delete-node/ node;};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.NODE_DOES_NOT_EXIST]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(16);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(20);
  });

  test("Delete node before created node", async () => {
    mockReadFileSync("/{/delete-node/ node; node{};};");
    const context = new ContextAware("/folder/dts.dts", [], []);
    await context.parser.stable;
    const issues = await context.getContextIssues();
    expect(issues.length).toEqual(1);
    expect(issues[0].issues).toEqual([ContextIssues.NODE_DOES_NOT_EXIST]);
    expect(issues[0].astElement.firstToken.pos.col).toEqual(16);
    expect(
      issues[0].astElement.lastToken.pos.col +
        issues[0].astElement.lastToken.pos.len
    ).toEqual(20);
  });

  describe("delete ui", () => {
    test("Delete property", async () => {
      mockReadFileSync("/{node {prop1; /delete-property/ prop1;}};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(8);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(14);
    });

    test("Delete from two nodes property", async () => {
      mockReadFileSync(
        "/{node {prop1;}};/{node {prop1; /delete-property/ prop1;}};"
      );
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(3);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(25);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(31);

      expect(issues[1].issues).toEqual([ContextIssues.DELETE_PROPERTY]);
      expect(issues[1].astElement.firstToken.pos.col).toEqual(8);
      expect(
        issues[1].astElement.lastToken.pos.col +
          issues[1].astElement.lastToken.pos.len
      ).toEqual(14);

      expect(issues[2].issues).toEqual([ContextIssues.DUPLICATE_PROPERTY_NAME]);
      expect(issues[2].astElement.firstToken.pos.col).toEqual(8);
      expect(
        issues[2].astElement.lastToken.pos.col +
          issues[2].astElement.lastToken.pos.len
      ).toEqual(14);
    });

    test("Delete Node with name no address", async () => {
      mockReadFileSync("/{node {}; /delete-node/ node;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(2);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(10);

      expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(11);
      expect(
        issues[0].linkedTo[0].lastToken.pos.col +
          issues[0].linkedTo[0].lastToken.pos.len
      ).toEqual(30);
    });

    test("Delete Node with name with address", async () => {
      mockReadFileSync("/{node@200 {}; node@300 {}; /delete-node/ node@300;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(15);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(27);
    });

    test("Delete Node with label ref", async () => {
      mockReadFileSync("/{l1: node {};};  /delete-node/ &l1;");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(2);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(14);
    });

    test("Delete Node with path", async () => {
      mockReadFileSync(
        "/{l1: node1 {node2 {};};};  /delete-node/ &{/node1/node2};"
      );
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(13);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(22);
    });

    test("Delete multiple Node", async () => {
      mockReadFileSync("/{node {};};/{node {}; /delete-node/ node};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(2);
      expect(issues[0].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(2);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(10);
      expect(issues[1].issues).toEqual([ContextIssues.DELETE_NODE]);
      expect(issues[1].astElement.firstToken.pos.col).toEqual(14);
      expect(
        issues[1].astElement.lastToken.pos.col +
          issues[1].astElement.lastToken.pos.len
      ).toEqual(22);
    });
  });

  describe("Resolve node path", () => {
    test("Delete node with path not existsing", async () => {
      mockReadFileSync("/{node1{};};/delete-node/ &{/node1/node2};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(35);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(40);
      expect(issues[0].templateStrings).toEqual(["node2", "node1"]);
    });

    test("property array node part ref values", async () => {
      mockReadFileSync("/{node1{};}; /{prop1=<&{/node1/node2}>;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(31);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(36);
      expect(issues[0].templateStrings).toEqual(["node2", "node1"]);
    });

    test("property node path ref", async () => {
      mockReadFileSync("/{node1{};}; /{prop1=&{/node1/node2};};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_NODE_PATH,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(30);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(35);
      expect(issues[0].templateStrings).toEqual(["node2", "node1"]);
    });
  });

  describe("Resolve label ref", () => {
    test("Delete node with path not existsing", async () => {
      mockReadFileSync("/{l1: node1{};};/delete-node/ &l2;");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(30);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(33);
      expect(issues[0].templateStrings).toEqual(["l2"]);
    });

    test("property array label ref value", async () => {
      mockReadFileSync("/{l1: node1{};}; /{prop1=<&l2>;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(26);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(29);
      expect(issues[0].templateStrings).toEqual(["l2"]);
    });

    test("property node path ref", async () => {
      mockReadFileSync("/{l1: node1{};}; /{prop1=&l2;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const issues = await context.getContextIssues();
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([
        ContextIssues.UNABLE_TO_RESOLVE_CHILD_NODE,
      ]);
      expect(issues[0].astElement.firstToken.pos.col).toEqual(25);
      expect(
        issues[0].astElement.lastToken.pos.col +
          issues[0].astElement.lastToken.pos.len
      ).toEqual(28);
      expect(issues[0].templateStrings).toEqual(["l2"]);
    });
  });
});
