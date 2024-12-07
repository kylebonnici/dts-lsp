/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Parser } from "../parser";
import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { SyntaxIssue } from "../types";
import {
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "../ast/dtc/node";
import { DtcProperty, PropertyName } from "../ast/dtc/property";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
import { LabelRef } from "../ast/dtc/labelRef";
import { PropertyValues } from "../ast/dtc/values/values";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { NumberValue } from "../ast/dtc/values/number";
import { NodePathRef } from "../ast/dtc/values/nodePath";
import { StringValue } from "../ast/dtc/values/string";
import { ByteStringValue } from "../ast/dtc/values/byteString";
import { DeleteNode } from "../ast/dtc/deleteNode";
import { Comment } from "../ast/dtc/comment";

jest.mock("fs", () => ({
  readFileSync: jest.fn().mockImplementation(() => {
    throw new Error("readFileSync - Not mocked");
  }),
}));

const mockReadFileSync = (content: string) => {
  //   (fs.readFileSync as unknown as jest.Mock).mockReset();
  (fs.readFileSync as unknown as jest.Mock).mockImplementation(() => {
    return content;
  });
};
describe("Parser", () => {
  beforeEach(() => {
    resetTokenizedDocmentProvider();
  });

  describe("Missing semicolon", () => {
    test("Root Node", async () => {
      mockReadFileSync("/{}");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 2,
        len: 1,
      });
    });

    test("Child Node", async () => {
      mockReadFileSync("/{ node {}};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 9,
        len: 1,
      });
    });

    test("Root and Child Node", async () => {
      mockReadFileSync("/{ node {}}");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 9,
        len: 1,
      });

      expect(parser.issues[1].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[1].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 10,
        len: 1,
      });
    });

    test("Property no value", async () => {
      mockReadFileSync("/{ prop1 };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 7,
        len: 1,
      });
    });

    test("Property with value", async () => {
      mockReadFileSync("/{ prop1=<10> };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 12,
        len: 1,
      });
    });

    test("Property in node with value", async () => {
      mockReadFileSync("/{ node {prop1=<10>} };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 18,
        len: 1,
      });

      expect(parser.issues[1].issues).toEqual([SyntaxIssue.END_STATMENT]);
      expect(parser.issues[1].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 19,
        len: 1,
      });
    });
  });

  describe("Missing open curly", () => {
    test("Child node, with address", async () => {
      mockReadFileSync("/{node1@20 };};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_OPEN]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(2);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(9);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);
    });

    test("Ref Node", async () => {
      mockReadFileSync("&label };");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_OPEN]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(1);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(5);

      const refNode = parser.rootDocument.children[0];
      expect(refNode instanceof DtcRefNode).toBeTruthy();
      expect((refNode as DtcRefNode).labelReferance?.value).toBe("label");
    });
  });

  describe("Missing close curly", () => {
    test("Ref Node", async () => {
      mockReadFileSync("&label {");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(7);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);
    });

    test("Root Node", async () => {
      mockReadFileSync("/{");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(1);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);
    });

    test("Child Node", async () => {
      mockReadFileSync("/{ node1{}; node{");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(16);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);
    });

    test("Ref Path", async () => {
      mockReadFileSync("/{prop=<&{/node1/node2>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(
        parser.issues[0].astElement.lastToken.pos.col +
          parser.issues[0].astElement.lastToken.pos.len
      ).toEqual(22);
    });
  });

  describe("White Space", () => {
    test("Child node, whitespce between address", async () => {
      mockReadFileSync("/{node1@ 20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(8);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(9);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });

    test("Child node, whitespce between name", async () => {
      mockReadFileSync("/{node1 @20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(7);

      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(8);
      expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });

    test("Ref Path start", async () => {
      mockReadFileSync("/{prop=<&{  /node1/node2}>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(10);

      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(12);
    });

    test("Ref Path end", async () => {
      mockReadFileSync("/{prop=<&{/node1/node2    }>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(22);

      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(26);
    });

    test("Ref Path between - 1", async () => {
      mockReadFileSync("/{prop=<&{/node1    /node2}>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(16);

      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(20);
    });

    test("Ref Path between - 2", async () => {
      mockReadFileSync("/{prop=<&{/node1/    node2}>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(
        parser.issues[0].astElement.firstToken.pos.col +
          parser.issues[0].astElement.firstToken.pos.len
      ).toEqual(17);

      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(21);
    });
  });

  describe("Missing forward slash", () => {
    test("Ref Path start", async () => {
      mockReadFileSync("/{prop=<&{node1/node2}>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([
        SyntaxIssue.FORWARD_SLASH_START_PATH,
      ]);

      expect(
        parser.issues[0].astElement.lastToken.pos.col +
          parser.issues[0].astElement.lastToken.pos.len
      ).toEqual(10);
    });
  });

  describe("Property", () => {
    test("Property in root doc", async () => {
      mockReadFileSync("prop1=<10>;");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([
        SyntaxIssue.PROPETY_MUST_BE_IN_NODE,
      ]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(0);
      expect(
        parser.issues[0].astElement.lastToken.pos.col +
          parser.issues[0].astElement.lastToken.pos.len
      ).toEqual(11);
    });

    describe("Values", () => {
      describe("Bytestring value", () => {
        test("With spaces ", async () => {
          mockReadFileSync("/{prop=[00 11 22 33];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x22, 0x33]);
        });

        test("With no spaces ", async () => {
          mockReadFileSync("/{prop=[00112233];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x22, 0x33]);
        });

        test("Mixed spaces and no spaces ", async () => {
          mockReadFileSync("/{prop=[00 1122 33];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x22, 0x33]);
        });

        test("With no odd values no spaces ", async () => {
          mockReadFileSync("/{prop=[0011223];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(14);
          expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);

          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x22, 0x3]);
        });

        test("With no odd values with spaces - 1", async () => {
          mockReadFileSync("/{prop=[00 11 22 3];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(17);
          expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);

          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x22, 0x3]);
        });

        test("With no odd values with spaces - 1", async () => {
          mockReadFileSync("/{prop=[00 11 2 33];};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(14);
          expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);

          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ByteStringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ByteStringValue
            ).values.map((v) => v.value?.value)
          ).toEqual([0x00, 0x11, 0x2, 0x33]);
        });
      });
      test("Label ref ", async () => {
        mockReadFileSync("/{prop=&l1;};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);
        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.properties.length).toEqual(1);
        expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
        expect(
          rootDts.properties[0].values instanceof PropertyValues
        ).toBeTruthy();
        expect(rootDts.properties[0].values?.values.length).toEqual(1);
        expect(
          rootDts.properties[0].values?.values[0]?.value instanceof LabelRef
        ).toBeTruthy();
        expect(
          (rootDts.properties[0].values?.values[0]?.value as LabelRef).label
            ?.value
        ).toEqual("l1");
      });

      describe("String value", () => {
        test("String value single qotes with double qotes inside", async () => {
          mockReadFileSync("/{prop='He said \"Hi\".';};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              StringValue
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as StringValue
            ).toString()
          ).toEqual("'He said \"Hi\".'");
        });

        test("String value double qotes and single qotes inside", async () => {
          mockReadFileSync("/{prop=\"He said 'Hi'.\";};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              StringValue
          ).toBeTruthy();
          expect(
            (rootDts.properties[0].values?.values[0]?.value as StringValue)
              .value
          ).toEqual("\"He said 'Hi'.\"");
        });

        test("String value double qotes and double qotes inside", async () => {
          mockReadFileSync('/{prop="He said \\"Hi\\".";};');
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              StringValue
          ).toBeTruthy();
          expect(
            (rootDts.properties[0].values?.values[0]?.value as StringValue)
              .value
          ).toEqual('"He said \\"Hi\\"."');
        });

        test("String value Single qotes and Single qotes inside", async () => {
          mockReadFileSync("/{prop='He said \\'Hi\\'.';};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              StringValue
          ).toBeTruthy();
          expect(
            (rootDts.properties[0].values?.values[0]?.value as StringValue)
              .value
          ).toEqual("'He said \\'Hi\\'.'");
        });

        test("Multi line String value", async () => {
          mockReadFileSync("/{prop='He said \n nice line breal\n right?';};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              StringValue
          ).toBeTruthy();
          expect(
            (rootDts.properties[0].values?.values[0]?.value as StringValue)
              .value
          ).toEqual("'He said \n nice line breal\n right?'");
        });
      });

      describe("Cell array", () => {
        test("Number Array", async () => {
          mockReadFileSync("/{prop=<10 20 30 0xFF 0xaa>;};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ArrayValues
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values.map((v) => (v.value as NumberValue).value)
          ).toEqual([10, 20, 30, 0xff, 0xaa]);

          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values.map((v) => (v.value as NumberValue).toString())
          ).toEqual(["10", "20", "30", (0xff).toString(), (0xaa).toString()]);
        });

        test("Single inside label ref ", async () => {
          mockReadFileSync("/{prop=<&l1>;};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ArrayValues
          ).toBeTruthy();
          expect(
            (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
              .values[0].value instanceof LabelRef
          ).toBeTruthy();
          expect(
            (
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[0].value as LabelRef
            ).value
          ).toEqual("l1");
        });

        test("Single Array Values inside mixed  ", async () => {
          mockReadFileSync("/{prop=<&l1 &{/node1/node2} 20 >;};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(
            (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
              .values[0].value instanceof LabelRef
          ).toBeTruthy();
          expect(
            (
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[0].value as LabelRef
            ).value
          ).toEqual("l1");

          expect(
            (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
              .values[1].value instanceof NodePathRef
          ).toBeTruthy();
          expect(
            (
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[1].value as NodePathRef
            ).path?.pathParts.map((p) => p?.toString())
          ).toEqual(["node1", "node2"]);

          expect(
            (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
              .values[2].value instanceof NumberValue
          ).toBeTruthy();
          expect(
            (
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[2].value as NumberValue
            ).value
          ).toEqual(20);

          rootDts.getDocumentSymbols();
        });

        describe("Node Ref Path", () => {
          test("Ends with extra slash", async () => {
            mockReadFileSync("/{prop=<&{/node1/node2/}>;};");
            const parser = new Parser("/folder/dts.dts", [], []);
            await parser.stable;
            expect(parser.issues.length).toEqual(1);
            expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_NAME]);

            expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(22);

            expect(parser.issues[0].astElement.lastToken.pos.len).toEqual(1);
          });

          test("missing ending curly", async () => {
            mockReadFileSync("/{prop=<&{/node1/node2>;};");
            const parser = new Parser("/folder/dts.dts", [], []);
            await parser.stable;
            expect(parser.issues.length).toEqual(1);
            expect(parser.issues[0].issues).toEqual([SyntaxIssue.CURLY_CLOSE]);

            expect(
              parser.issues[0].astElement.lastToken.pos.col +
                parser.issues[0].astElement.lastToken.pos.len
            ).toEqual(22);
          });
        });

        test("labled number array", async () => {
          mockReadFileSync(
            "/{l1: prop=l2: <l3: 10 l4: 20 l5: 30 l6: 0xFF l7: 0xaa l8:> l9: ;};"
          );
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(rootDts.properties[0].labels.map((l) => l.label)).toEqual([
            "l1",
          ]);
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();
          expect(rootDts.properties[0].values?.values.length).toEqual(1);
          expect(
            rootDts.properties[0].values?.values[0]?.value instanceof
              ArrayValues
          ).toBeTruthy();
          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values.map((v) => (v.value as NumberValue).value)
          ).toEqual([10, 20, 30, 0xff, 0xaa]);

          expect(
            rootDts.properties[0].values?.labels.map((l) => l.label)
          ).toEqual(["l2"]);

          expect(
            rootDts.properties[0].values?.values[0]?.endLabels.map(
              (l) => l.label
            )
          ).toEqual(["l8", "l9"]);

          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values.map((v) => v.labels.map((l) => l.label))
          ).toEqual([["l3"], ["l4"], ["l5"], ["l6"], ["l7"]]);
        });
      });

      describe("Multiple values", () => {
        test("Mixed valid", async () => {
          mockReadFileSync(
            "/{prop=<10 0xaa>, 'Foo', \"Bar\", [10 20], [3040], &l1, <&{/node1/node2} 10>;};"
          );
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].values instanceof PropertyValues
          ).toBeTruthy();

          const values = rootDts.properties[0].values as PropertyValues;

          expect(values?.values.length).toEqual(7);

          expect(values?.values[0]?.value instanceof ArrayValues).toBeTruthy();
          expect(
            (values?.values[0]?.value as ArrayValues).values.map(
              (v) => (v.value as NumberValue).value
            )
          ).toEqual([10, 0xaa]);
          expect(
            (values?.values[0]?.value as ArrayValues).values.map((v) =>
              (v.value as NumberValue).toString()
            )
          ).toEqual(["10", (0xaa).toString()]);

          expect(values?.values[1]?.value instanceof StringValue).toBeTruthy();
          expect((values?.values[1]?.value as StringValue).value).toEqual(
            "'Foo'"
          );

          expect(values?.values[2]?.value instanceof StringValue).toBeTruthy();
          expect((values?.values[2]?.value as StringValue).value).toEqual(
            '"Bar"'
          );

          expect(
            values?.values[3]?.value instanceof ByteStringValue
          ).toBeTruthy();
          expect(
            (values?.values[3]?.value as ByteStringValue).values.map(
              (v) => v.value?.value
            )
          ).toEqual([0x10, 0x20]);

          expect(
            values?.values[4]?.value instanceof ByteStringValue
          ).toBeTruthy();
          expect(
            (values?.values[4]?.value as ByteStringValue).values.map(
              (v) => v.value?.value
            )
          ).toEqual([0x30, 0x40]);

          expect(values?.values[5]?.value instanceof LabelRef).toBeTruthy();
          expect((values?.values[5]?.value as LabelRef).label?.value).toEqual(
            "l1"
          );

          expect(values?.values[6]?.value instanceof ArrayValues).toBeTruthy();
          expect(
            (values?.values[6]?.value as ArrayValues).values.length
          ).toEqual(2);
          expect(
            (values?.values[6]?.value as ArrayValues).values[0].value instanceof
              NodePathRef
          ).toBeTruthy();
          expect(
            (
              (values?.values[6]?.value as ArrayValues).values[0]
                .value as NodePathRef
            ).path?.pathParts.map((m) => m?.toString())
          ).toEqual(["node1", "node2"]);
          expect(
            (values?.values[6]?.value as ArrayValues).values[1].value instanceof
              NumberValue
          ).toBeTruthy();
          expect(
            (
              (values?.values[6]?.value as ArrayValues).values[1]
                .value as NumberValue
            ).value
          ).toEqual(10);
        });

        test("Missing comma", async () => {
          mockReadFileSync("/{prop=<10 20> <20 30>;};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);

          expect(parser.issues[0].issues).toEqual([SyntaxIssue.MISSING_COMMA]);
          expect(
            parser.issues[0].astElement.lastToken.pos.col +
              parser.issues[0].astElement.lastToken.pos.len
          ).toEqual(14);
        });

        test("Missing value", async () => {
          mockReadFileSync("/{prop=<10 20>, ,<20 30>;};");
          const parser = new Parser("/folder/dts.dts", [], []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);

          expect(parser.issues[0].issues).toEqual([SyntaxIssue.VALUE]);
          expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(14);
          expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(16);
        });
      });
    });
  });

  describe("Node syntax", () => {
    test("Empty Root Node", async () => {
      mockReadFileSync("/{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRootNode
      ).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(0);
      expect(parser.rootDocument.children[0].firstToken.pos).toEqual({
        line: 0,
        col: 0,
        len: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 3,
        len: 1,
      });
    });

    test("Root Node with properties", async () => {
      mockReadFileSync("/{prop1; prop2=<10>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc instanceof DtcRootNode).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(2);

      // Root DTC
      expect(rootDtc.firstToken.pos.col).toEqual(0);
      expect(rootDtc.lastToken.pos.col).toEqual(21);

      // Prop1
      const prop1 = rootDtc.children[0];
      expect(prop1 instanceof DtcProperty).toBeTruthy();
      expect(prop1.firstToken.pos.col).toEqual(2);
      expect(prop1.lastToken.pos.col).toEqual(7);

      // Prop2
      const prop2 = rootDtc.children[1];
      expect(prop2 instanceof DtcProperty).toBeTruthy();
      expect(prop2.firstToken.pos.col).toEqual(9);
      expect(prop2.lastToken.pos.col).toEqual(19);
    });

    test("Root Node with nested nodes", async () => {
      mockReadFileSync("/{node1{}; node2{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc instanceof DtcRootNode).toBeTruthy();
      expect(parser.rootDocument.children[0].children.length).toEqual(2);

      // Root DTC
      expect(rootDtc.firstToken.pos.col).toEqual(0);
      expect(rootDtc.lastToken.pos.col).toEqual(20);

      // node1
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(9);

      // Prop2
      const node2 = rootDtc.children[1];
      expect(node2 instanceof DtcChildNode).toBeTruthy();
      expect(node2.firstToken.pos.col).toEqual(11);
      expect(node2.lastToken.pos.col).toEqual(18);
    });

    test("Ref Node", async () => {
      mockReadFileSync("&label{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRefNode
      ).toBeTruthy();
      expect(
        parser.rootDocument.children[0].children[0] instanceof LabelRef
      ).toBeTruthy();
      expect(
        (parser.rootDocument.children[0].children[0] as LabelRef).value
      ).toBe("label");
      expect(parser.rootDocument.children[0].firstToken.pos).toEqual({
        line: 0,
        col: 0,
        len: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 8,
        len: 1,
      });
    });

    test("Labled Ref Node", async () => {
      mockReadFileSync("l1: l2: &label{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRefNode
      ).toBeTruthy();
      const refNode = parser.rootDocument.children[0] as DtcRefNode;

      expect(refNode.labels.length).toEqual(2);
      expect(refNode.labels[0].label).toEqual("l1");
      expect(refNode.labels[1].label).toEqual("l2");
      expect(refNode.labelReferance?.value).toEqual("label");
    });

    test("Child node, no address", async () => {
      mockReadFileSync("/{node1{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBeUndefined();
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(9);
    });

    test("Child node, with address", async () => {
      mockReadFileSync("/{node1@20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect((node1.children[0] as NodeName).address).toBe(0x20);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(12);
    });

    test("Child node, multilabled with address", async () => {
      mockReadFileSync("/{l1: l2: node1@20{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      expect(rootDtc.children[0] instanceof DtcChildNode).toBeTruthy();
      const node1 = rootDtc.children[0] as DtcChildNode;
      expect(node1.name?.name).toEqual("node1");
      expect(node1.name?.name);
      expect(node1.name?.address).toEqual(0x20);

      expect(node1.labels.length).toEqual(2);
      expect(node1.labels[0].label).toEqual("l1");
      expect(node1.labels[1].label).toEqual("l2");
    });

    test("Child node, missing address", async () => {
      mockReadFileSync("/{node1@{};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_ADDRESS]);
      expect(parser.issues[0].astElement.lastToken.pos).toEqual({
        line: 0,
        col: 6,
        len: 1,
      });
    });

    test("Root node, missing name or ref", async () => {
      mockReadFileSync("{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([
        SyntaxIssue.NODE_REF,
        SyntaxIssue.ROOT_NODE_NAME,
      ]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(2);
    });

    test("Ref node, no ref label", async () => {
      mockReadFileSync("&{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.LABEL_NAME]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(0);
    });

    test("Labeled Ref node, no ref label", async () => {
      mockReadFileSync("label: &{};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.LABEL_NAME]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(7);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(7);
    });

    test("Child node, missing node name", async () => {
      mockReadFileSync("/{ {};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_NAME]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(3);
      expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(5);
    });

    test("Labled Child node, missing node name", async () => {
      mockReadFileSync("/{ label: {};};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_NAME]);
      expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(10);

      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc.children[0] instanceof DtcChildNode).toBeTruthy();
      expect((rootDtc.children[0] as DtcChildNode).labels[0].label).toBe(
        "label"
      );
    });
  });

  describe("Delete", () => {
    describe("Node", () => {
      test("with node name no address", async () => {
        mockReadFileSync("/{/delete-node/ nodeName;};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteNodes.length).toEqual(1);
        expect(
          rootDts.deleteNodes[0].nodeNameOrRef instanceof NodeName
        ).toBeTruthy();
        expect((rootDts.deleteNodes[0].nodeNameOrRef as NodeName).name).toEqual(
          "nodeName"
        );
      });

      test("with node name with address", async () => {
        mockReadFileSync("/{/delete-node/ nodeName@200;};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteNodes.length).toEqual(1);
        expect(
          rootDts.deleteNodes[0].nodeNameOrRef instanceof NodeName
        ).toBeTruthy();
        expect((rootDts.deleteNodes[0].nodeNameOrRef as NodeName).name).toEqual(
          "nodeName"
        );
        expect(
          (rootDts.deleteNodes[0].nodeNameOrRef as NodeName).address
        ).toEqual(0x200);
      });

      test("with node path ref in root node - expects node name", async () => {
        mockReadFileSync("/{/delete-node/ &{/node1/node2@200};};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_NAME]);

        expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(16);
        expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(34);
      });

      test("with label ref in root node - expects node name", async () => {
        mockReadFileSync("/{/delete-node/ &l1;};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].issues).toEqual([SyntaxIssue.NODE_NAME]);

        expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(16);
        expect(parser.issues[0].astElement.lastToken.pos.col).toEqual(18);
      });

      test("with node path ref in raw doc", async () => {
        mockReadFileSync("/delete-node/ &{/node1/node2@200};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const deleteNode = parser.rootDocument.children[0] as DeleteNode;

        expect(deleteNode.nodeNameOrRef instanceof NodePathRef).toBeTruthy();
        expect(
          (deleteNode.nodeNameOrRef as NodePathRef).path?.pathParts.map((p) =>
            p?.toString()
          )
        ).toEqual(["node1", "node2@200"]);
      });

      test("with label ref in raw doc", async () => {
        mockReadFileSync("/delete-node/ &l1;");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const deleteNode = parser.rootDocument.children[0] as DeleteNode;

        expect(deleteNode.nodeNameOrRef instanceof LabelRef).toBeTruthy();
        expect((deleteNode.nodeNameOrRef as LabelRef).label?.value).toEqual(
          "l1"
        );
      });
    });

    describe("Property", () => {
      test("Delete Property in node", async () => {
        mockReadFileSync("/{/delete-property/ prop1;};");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteProperties.length).toEqual(1);
        expect(rootDts.deleteProperties[0].propertyName?.name).toEqual("prop1");
      });

      test("Delete Property in root doc", async () => {
        mockReadFileSync("/delete-property/ prop1;");
        const parser = new Parser("/folder/dts.dts", [], []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].issues).toEqual([
          SyntaxIssue.PROPETY_DELETE_MUST_BE_IN_NODE,
        ]);
        expect(parser.issues[0].astElement.firstToken.pos.col).toEqual(0);
        expect(
          parser.issues[0].astElement.lastToken.pos.col +
            parser.issues[0].astElement.lastToken.pos.len
        ).toEqual(24);
      });
    });
  });

  describe("Comments", () => {
    test("inline", async () => {
      mockReadFileSync("    // foo bar    .");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof Comment).toBeTruthy();

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(4);
      expect(comment.lastToken.pos.col).toEqual(18);
    });

    test("Multi line on single line ", async () => {
      mockReadFileSync("    /* foo bar */ ");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof Comment).toBeTruthy();

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(4);
      expect(comment.lastToken.pos.col).toEqual(16);
    });

    test("Multi line on multi line", async () => {
      mockReadFileSync("    /* foo \nbar */ ");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(2);

      expect(parser.allAstItems[0] instanceof Comment).toBeTruthy();

      const commentLine1 = parser.allAstItems[0] as Comment;
      const commentLine2 = parser.allAstItems[1] as Comment;
      expect(commentLine1.firstToken.pos.col).toEqual(4);
      expect(commentLine1.firstToken.pos.line).toEqual(0);
      expect(
        commentLine1.lastToken.pos.col + commentLine1.lastToken.pos.len
      ).toEqual(10);

      expect(commentLine2.firstToken.pos.col).toEqual(0);
      expect(commentLine2.firstToken.pos.line).toEqual(1);
      expect(commentLine2.lastToken.pos.col).toEqual(5);
      expect(commentLine2.lastToken.pos.line).toEqual(1);
    });

    test("Multi line between elements", async () => {
      mockReadFileSync("/{prop= /* foo bar */  <10>;};");
      const parser = new Parser("/folder/dts.dts", [], []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);

      const comments = parser.allAstItems.filter(
        (o) => o instanceof Comment
      ) as Comment[];
      expect(comments.length).toEqual(1);

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(8);
      expect(comment.lastToken.pos.col).toEqual(20);

      const rootDts = parser.rootDocument.children[0] as DtcRootNode;
      expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
      expect(
        rootDts.properties[0].values instanceof PropertyValues
      ).toBeTruthy();
      expect(rootDts.properties[0].values?.values.length).toEqual(1);
      expect(
        rootDts.properties[0].values?.values[0]?.value instanceof ArrayValues
      ).toBeTruthy();
      expect(
        (
          rootDts.properties[0].values?.values[0]?.value as ArrayValues
        ).values.map((v) => (v.value as NumberValue).value)
      ).toEqual([10]);
    });
  });
});
