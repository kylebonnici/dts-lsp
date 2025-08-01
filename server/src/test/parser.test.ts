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
import { DtcProperty } from "../ast/dtc/property";
import { resetTokenizedDocumentProvider } from "../providers/tokenizedDocument";
import { LabelRef } from "../ast/dtc/labelRef";
import { PropertyValues } from "../ast/dtc/values/values";
import { ArrayValues } from "../ast/dtc/values/arrayValue";
import { NumberValue } from "../ast/dtc/values/number";
import { NodePathRef } from "../ast/dtc/values/nodePath";
import { StringValue } from "../ast/dtc/values/string";
import { ByteStringValue } from "../ast/dtc/values/byteString";
import { DeleteNode } from "../ast/dtc/deleteNode";
import { Comment, CommentBlock } from "../ast/dtc/comment";
import { IfDefineBlock, IfElIfBlock } from "../ast/cPreprocessors/ifDefine";
import { CPreprocessorParser } from "../cPreprocessorParser";
import { DtsDocumentVersion } from "../ast/dtc/dtsDocVersion";
import { CMacroCall } from "../ast/cPreprocessors/functionCall";
import {
  ComplexExpression,
  Expression,
} from "../ast/cPreprocessors/expression";
import { CIdentifier } from "../ast/cPreprocessors/cIdentifier";
import { CMacro } from "../ast/cPreprocessors/macro";
import {
  FunctionDefinition,
  Variadic,
} from "../ast/cPreprocessors/functionDefinition";
import { DtsMemreserveNode } from "../ast/dtc/memreserveNode";
import { tokensToString } from "../helpers";

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

const mockReadFilesSync = (content: { [path: string]: string }) => {
  (fs.readFileSync as unknown as jest.Mock).mockClear();

  (fs.readFileSync as unknown as jest.Mock).mockImplementation((p) => {
    return content[p as string];
  });

  (fs.existsSync as unknown as jest.Mock).mockClear();
  (fs.existsSync as unknown as jest.Mock).mockImplementation((p) => {
    return content[p as string] !== undefined;
  });
};

describe("Parser", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  describe("Doc version", () => {
    test("Valid", async () => {
      mockReadFileSync("/dts-v1/;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);

      expect(parser.others.length).toEqual(1);
      expect(parser.others[0] instanceof DtsDocumentVersion).toBeTruthy();
    });

    test("Missing end slash", async () => {
      mockReadFileSync("/dts-v1");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.MISSING_FORWARD_SLASH_END,
      ]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(7);
    });
  });

  describe("Memreserve", () => {
    test("Valid", async () => {
      mockReadFileSync("/memreserve/ 0x123 0x345;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);

      expect(parser.others.length).toEqual(1);
      expect(parser.others[0] instanceof DtsMemreserveNode).toBeTruthy();
      expect(
        (parser.others[0] as DtsMemreserveNode).startAddress?.value
      ).toEqual(0x123);
      expect((parser.others[0] as DtsMemreserveNode).endAddress?.value).toEqual(
        0x345
      );
    });

    test("Missing end slash", async () => {
      mockReadFileSync("/memreserve 0x123 0x345;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.MISSING_FORWARD_SLASH_END,
      ]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(11);

      expect(parser.others[0] instanceof DtsMemreserveNode).toBeTruthy();
      expect(
        (parser.others[0] as DtsMemreserveNode).startAddress?.value
      ).toEqual(0x123);
      expect((parser.others[0] as DtsMemreserveNode).endAddress?.value).toEqual(
        0x345
      );
    });

    test("Missing end address slash", async () => {
      mockReadFileSync("/memreserve/ 0x123;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.EXPECTED_END_ADDRESS,
      ]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(18);

      expect(parser.others[0] instanceof DtsMemreserveNode).toBeTruthy();
      expect(
        (parser.others[0] as DtsMemreserveNode).startAddress?.value
      ).toEqual(0x123);
      expect(
        (parser.others[0] as DtsMemreserveNode).endAddress?.value
      ).toBeUndefined();
    });

    test("Missing start and end address slash", async () => {
      mockReadFileSync("/memreserve/;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.EXPECTED_START_ADDRESS,
      ]);
      expect(parser.issues[1].raw.issues).toEqual([
        SyntaxIssue.EXPECTED_END_ADDRESS,
      ]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(12);
      expect(parser.issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(12);

      expect(parser.others[0] instanceof DtsMemreserveNode).toBeTruthy();
      expect(
        (parser.others[0] as DtsMemreserveNode).startAddress?.value
      ).toBeUndefined();
      expect(
        (parser.others[0] as DtsMemreserveNode).endAddress?.value
      ).toBeUndefined();
    });
  });

  describe("Semicolon", () => {
    describe("Missing", () => {
      test("Doc version", async () => {
        mockReadFileSync("/dts-v1/");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 7,
          len: 1,
          colEnd: 8,
        });
      });

      test("Root Node", async () => {
        mockReadFileSync("/{}");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 2,
          len: 1,
          colEnd: 3,
        });
      });

      test("Child Node", async () => {
        mockReadFileSync("/{ node {}};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 9,
          len: 1,
          colEnd: 10,
        });
      });

      test("Root and Child Node", async () => {
        mockReadFileSync("/{ node {}}");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(2);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 9,
          len: 1,
          colEnd: 10,
        });

        expect(parser.issues[1].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[1].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 10,
          len: 1,
          colEnd: 11,
        });
      });

      test("Property no value", async () => {
        mockReadFileSync("/{ prop1 };");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 7,
          len: 1,
          colEnd: 8,
        });
      });

      test("Property with value", async () => {
        mockReadFileSync("/{ prop1=<10> };");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 12,
          len: 1,
          colEnd: 13,
        });
      });

      test("Property in node with value", async () => {
        mockReadFileSync("/{ node {prop1=<10>} };");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(2);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 18,
          len: 1,
          colEnd: 19,
        });

        expect(parser.issues[1].raw.issues).toEqual([
          SyntaxIssue.END_STATEMENT,
        ]);
        expect(parser.issues[1].raw.astElement.lastToken.pos).toEqual({
          line: 0,
          col: 19,
          len: 1,
          colEnd: 20,
        });
      });
    });

    test("Extra", async () => {
      mockReadFileSync("/{};;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NO_STATEMENT]);
      expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
        line: 0,
        col: 4,
        len: 1,
        colEnd: 5,
      });
    });
  });

  describe("Missing open curly", () => {
    test("Child node, with address", async () => {
      mockReadFileSync("/{node1@20 \n};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_OPEN]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(9);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);
    });

    test("Ref Node", async () => {
      mockReadFileSync("&label ");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_OPEN]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(1);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(5);

      const refNode = parser.rootDocument.children[0];
      expect(refNode instanceof DtcRefNode).toBeTruthy();
      expect(
        (refNode as DtcRefNode).reference instanceof LabelRef
      ).toBeTruthy();
      expect(((refNode as DtcRefNode).reference as LabelRef).value).toEqual(
        "label"
      );
    });
  });

  describe("Missing close curly", () => {
    test("Ref Node", async () => {
      mockReadFileSync("&label {");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(7);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);
    });

    test("Root Node", async () => {
      mockReadFileSync("/{");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(1);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);
    });

    test("Child Node", async () => {
      mockReadFileSync("/{ node1{}; node{");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(16);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);
      expect(parser.issues[1].raw.issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[1].raw.astElement.lastToken.pos.col).toEqual(16);
      expect(parser.issues[1].raw.astElement.lastToken.pos.len).toEqual(1);
    });

    test("Ref Path", async () => {
      mockReadFileSync("/{prop=<&{/node1/node2>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.CURLY_CLOSE]);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(22);
    });
  });

  describe("White Space", () => {
    test("Child node, whitespace between address", async () => {
      mockReadFileSync("/{node1@ 20{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(8);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(9);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });

    test("Child node, whitespace between name", async () => {
      mockReadFileSync("/{node1 @20{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(7);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(8);
      expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(13);
    });

    test("Ref Path start", async () => {
      mockReadFileSync("/{prop=<&{  /node1/node2}>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(10);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(12);
    });

    test("Label assign", async () => {
      mockReadFileSync("/{l1   : node{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(4);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(7);
    });

    test("Label ref", async () => {
      mockReadFileSync("/{prop=&  l1;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(8);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(10);
    });

    test("Label ref child node", async () => {
      mockReadFileSync("&  n1{ };");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(1);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(3);
    });

    test("Ref Path end", async () => {
      mockReadFileSync("/{prop=<&{/node1/node2    }>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(22);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(26);
    });

    test("Ref Path between - 1", async () => {
      mockReadFileSync("/{prop=<&{/node1    /node2}>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(16);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(20);
    });

    test("Ref Path between - 2", async () => {
      mockReadFileSync("/{prop=<&{/node1/    node2}>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.WHITE_SPACE]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.colEnd).toEqual(17);

      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(21);
    });
  });

  describe("Missing forward slash", () => {
    test("Ref Path start", async () => {
      mockReadFileSync("/{prop=<&{node1/node2}>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.FORWARD_SLASH_START_PATH,
      ]);

      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(10);
    });
  });

  describe("Property", () => {
    test("Property in root doc", async () => {
      mockReadFileSync("prop1=<10>;");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.PROPERTY_MUST_BE_IN_NODE,
      ]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(11);
    });

    describe("Values", () => {
      describe("Macro calls", () => {
        test("At root", async () => {
          mockReadFileSync("#define FOO(x) \n /{prop=FOO(10);};");
          const parser = new Parser("/folder/dts.dts", []);
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
            rootDts.properties[0].values?.values[0]?.value instanceof CMacroCall
          ).toBeTruthy();

          const macro = rootDts.properties[0].values?.values[0]
            ?.value as CMacroCall as CMacroCall;

          expect(macro.functionName.name).toEqual("FOO");
          expect(macro.params.map((p) => p?.value)).toEqual(["10"]);
        });

        test("No Parameters", async () => {
          mockReadFileSync("#define FOO() ff \n /{prop=FOO();};");
          const parser = new Parser("/folder/dts.dts", []);
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
            rootDts.properties[0].values?.values[0]?.value instanceof CMacroCall
          ).toBeTruthy();

          const macro = rootDts.properties[0].values?.values[0]
            ?.value as CMacroCall as CMacroCall;

          expect(macro.functionName.name).toEqual("FOO");
          expect(macro.params.map((p) => p?.value)).toEqual([]);
        });

        test("No Missing Parameter", async () => {
          mockReadFileSync("#define FOO(x,y,z) \n/{prop=FOO(10,,20);};");
          const parser = new Parser("/folder/dts.dts", []);
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
            rootDts.properties[0].values?.values[0]?.value instanceof CMacroCall
          ).toBeTruthy();

          const macro = rootDts.properties[0].values?.values[0]
            ?.value as CMacroCall as CMacroCall;

          expect(macro.functionName.name).toEqual("FOO");
          expect(macro.params.map((p) => p?.value)).toEqual([
            "10",
            undefined,
            "20",
          ]);
        });
      });
      describe("Bytestring value", () => {
        test("With spaces ", async () => {
          mockReadFileSync("/{prop=[00 11 22 33];};");
          const parser = new Parser("/folder/dts.dts", []);
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
          const parser = new Parser("/folder/dts.dts", []);
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
          const parser = new Parser("/folder/dts.dts", []);
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
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].raw.issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(14);
          expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);

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
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].raw.issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(17);
          expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);

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
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].raw.issues).toEqual([
            SyntaxIssue.BYTESTRING_EVEN,
          ]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(14);
          expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(1);

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
        const parser = new Parser("/folder/dts.dts", []);
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
        test("String value single quotes with double quotes inside", async () => {
          mockReadFileSync("/{prop='He said \"Hi\".';};");
          const parser = new Parser("/folder/dts.dts", []);
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
          ).toEqual('He said "Hi".');
        });

        test("String value double quotes and single quotes inside", async () => {
          mockReadFileSync("/{prop=\"He said 'Hi'.\";};");
          const parser = new Parser("/folder/dts.dts", []);
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
          ).toEqual("He said 'Hi'.");
        });

        test("String value double quotes and double quotes inside", async () => {
          mockReadFileSync('/{prop="He said \\"Hi\\".";};');
          const parser = new Parser("/folder/dts.dts", []);
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
          ).toEqual('He said \\"Hi\\".');
        });

        test("String value Single quotes and Single quotes inside", async () => {
          mockReadFileSync("/{prop='He said \\'Hi\\'.';};");
          const parser = new Parser("/folder/dts.dts", []);
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
          ).toEqual("He said \\'Hi\\'.");
        });

        test("Multi line String value", async () => {
          mockReadFileSync("/{prop='He said \n nice line breal\n right?';};");
          const parser = new Parser("/folder/dts.dts", []);
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
          ).toEqual("He said \n nice line breal\n right?");
        });
      });

      describe("Cell array", () => {
        test("Number Array", async () => {
          mockReadFileSync("/{prop=<10 20 30 0xFF 0xaa>;};");
          const parser = new Parser("/folder/dts.dts", []);
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

        describe("Macro calls", () => {
          test("With params", async () => {
            mockReadFileSync("#define ADD(x,y) \n/{prop=<ADD(1,2)>;};");
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof CMacroCall
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[0].value as CMacroCall;

            expect(macro.functionName.name).toEqual("ADD");
            expect(macro.params.map((p) => p?.value)).toEqual(["1", "2"]);
          });

          test("With params", async () => {
            mockReadFileSync("#define VAL 5 \n/{prop=<10 VAL (1 + 2)>;};");
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof NumberValue
            ).toBeTruthy();
            expect(
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[1].value instanceof CIdentifier
            ).toBeTruthy();
            expect(
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[2].value instanceof Expression
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[1].value as CIdentifier;

            expect(macro.name).toEqual("VAL");
          });

          test("C Macro expression missing coma", async () => {
            mockReadFileSync("#define ADD(x) \n/{prop=<ADD(1 2)>;};");
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof CMacroCall
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[0].value as CMacroCall;

            expect(macro.functionName.name).toEqual("ADD");
            expect(macro.params.map((p) => p?.value)).toEqual(["1 2"]);
          });

          test("Nested call", async () => {
            mockReadFileSync(
              "#define ADD(x,y)\n#define MULT(x,y)\n /{prop=<ADD(1,MULT(2, 5))>;};"
            );
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof CMacroCall
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[0].value as CMacroCall;

            expect(macro.functionName.name).toEqual("ADD");
            expect(macro.params.map((p) => p?.value)).toEqual([
              "1",
              "MULT(2, 5)",
            ]);
          });

          test("Math expression call", async () => {
            mockReadFileSync(
              "#define ADD(x,y) \n/{prop=<ADD(1,(2 + 5) * (50 + 1))>;};"
            );
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof CMacroCall
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[0].value as CMacroCall;

            expect(macro.functionName.name).toEqual("ADD");
            expect(macro.params.map((p) => p?.value)).toEqual([
              "1",
              "(2 + 5) * (50 + 1)",
            ]);
          });

          test("Macro on new line with \\", async () => {
            mockReadFileSync(
              "#define ADD(x,y,z) x+y+z \n/{prop=<ADD(1,\\\n2,\\\n3)>;};"
            );
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof CMacroCall
            ).toBeTruthy();

            const macro = (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values[0].value as CMacroCall;

            expect(macro.functionName.name).toEqual("ADD");
            expect(macro.params.map((p) => p?.value)).toEqual(["1", "2", "3"]);
          });

          test("Simple Macro in () and on new line with \\", async () => {
            mockReadFileSync("#define ADD(x,y) \n/{prop=<(ADD(1,\\\n2))>;};");
            const parser = new Parser("/folder/dts.dts", []);
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
                .values[0].value instanceof ComplexExpression
            ).toBeTruthy();
          });
        });

        test("Labeled expression ", async () => {
          mockReadFileSync("/{prop=<(10 + 20 * 4 / 5 + (10 + 20 - 30))>;};");
          const parser = new Parser("/folder/dts.dts", []);
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
              .values[0].value instanceof ComplexExpression
          ).toBeTruthy();
          expect(
            (
              (rootDts.properties[0].values?.values[0]?.value as ArrayValues)
                .values[0].value as ComplexExpression
            ).toString()
          ).toEqual("(10 + 20 * 4 / 5 + (10 + 20 - 30))");
        });

        test("Single inside label ref ", async () => {
          mockReadFileSync("/{prop=<&l1>;};");
          const parser = new Parser("/folder/dts.dts", []);
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
          const parser = new Parser("/folder/dts.dts", []);
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

          rootDts.getDocumentSymbols("/folder/dts.dts");
        });

        describe("Node Ref Path", () => {
          test("Ends with extra slash", async () => {
            mockReadFileSync("/{prop=<&{/node1/node2/}>;};");
            const parser = new Parser("/folder/dts.dts", []);
            await parser.stable;
            expect(parser.issues.length).toEqual(1);
            expect(parser.issues[0].raw.issues).toEqual([
              SyntaxIssue.NODE_NAME,
            ]);

            expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(
              22
            );

            expect(parser.issues[0].raw.astElement.lastToken.pos.len).toEqual(
              1
            );
          });

          test("missing ending curly", async () => {
            mockReadFileSync("/{prop=<&{/node1/node2>;};");
            const parser = new Parser("/folder/dts.dts", []);
            await parser.stable;
            expect(parser.issues.length).toEqual(1);
            expect(parser.issues[0].raw.issues).toEqual([
              SyntaxIssue.CURLY_CLOSE,
            ]);

            expect(
              parser.issues[0].raw.astElement.lastToken.pos.colEnd
            ).toEqual(22);
          });
        });

        test("labeled number array", async () => {
          mockReadFileSync(
            "/{l1: prop=l2: <l3: 10 l4: 20 l5: 30 l6: 0xFF l7: 0xaa l8:> l9: ;};"
          );
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          const rootDts = parser.rootDocument.children[0] as DtcRootNode;

          expect(rootDts.properties.length).toEqual(1);
          expect(rootDts.properties[0].propertyName?.name).toEqual("prop");
          expect(
            rootDts.properties[0].labels.map((l) => l.label.value)
          ).toEqual(["l1"]);
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
            rootDts.properties[0].values?.values[0]?.startLabels.map(
              (l) => l.label.value
            )
          ).toEqual(["l2"]);

          expect(
            rootDts.properties[0].values?.values[0]?.endLabels.map(
              (l) => l.label.value
            )
          ).toEqual(["l8", "l9"]);

          expect(
            (
              rootDts.properties[0].values?.values[0]?.value as ArrayValues
            ).values.map((v) => v.labels.map((l) => l.label.value))
          ).toEqual([["l3"], ["l4"], ["l5"], ["l6"], ["l7"]]);
        });

        test("labeled number array Missing :", async () => {
          mockReadFileSync("/{prop= l1 l2 <10>;};");
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(2);
          expect(parser.issues[0].raw.issues).toEqual([
            SyntaxIssue.LABEL_ASSIGN_MISSING_COLON,
          ]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
            10
          );

          expect(parser.issues[1].raw.issues).toEqual([
            SyntaxIssue.LABEL_ASSIGN_MISSING_COLON,
          ]);
          expect(parser.issues[1].raw.astElement.lastToken.pos.colEnd).toEqual(
            13
          );

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
          ).toEqual([10]);

          expect(
            rootDts.properties[0].values?.values[0]?.startLabels.map(
              (l) => l.label.value
            )
          ).toEqual(["l1", "l2"]);
        });
      });

      describe("Multiple values", () => {
        test("Mixed valid", async () => {
          mockReadFileSync(
            "/{prop=<10 0xaa>, 'Foo', \"Bar\", [10 20], [3040], &l1, <&{/node1/node2} 10>;};"
          );
          const parser = new Parser("/folder/dts.dts", []);
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
            "Foo"
          );

          expect(values?.values[2]?.value instanceof StringValue).toBeTruthy();
          expect((values?.values[2]?.value as StringValue).value).toEqual(
            "Bar"
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
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);

          expect(parser.issues[0].raw.issues).toEqual([
            SyntaxIssue.MISSING_COMMA,
          ]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
            14
          );
        });

        test("Missing value", async () => {
          mockReadFileSync("/{prop=<10 20>, ,<20 30>;};");
          const parser = new Parser("/folder/dts.dts", []);
          await parser.stable;
          expect(parser.issues.length).toEqual(1);

          expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.VALUE]);
          expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(
            14
          );
          expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(16);
        });
      });

      test("Node path ref ", async () => {
        mockReadFileSync("/{prop=&{/node1/node2};};");
        const parser = new Parser("/folder/dts.dts", []);
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
          rootDts.properties[0].values?.values[0]?.value instanceof NodePathRef
        ).toBeTruthy();
        expect(
          (
            rootDts.properties[0].values?.values[0]?.value as NodePathRef
          ).path?.pathParts.map((p) => p?.toString())
        ).toEqual(["node1", "node2"]);
      });
    });
  });

  describe("Node syntax", () => {
    test("Empty Root Node", async () => {
      mockReadFileSync("/{};");
      const parser = new Parser("/folder/dts.dts", []);
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
        colEnd: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 3,
        len: 1,
        colEnd: 4,
      });
    });

    test("Root Node with properties", async () => {
      mockReadFileSync("/{prop1; prop2=<10>;};");
      const parser = new Parser("/folder/dts.dts", []);
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
      const parser = new Parser("/folder/dts.dts", []);
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

    test("Label Ref Node", async () => {
      mockReadFileSync("&label{};");
      const parser = new Parser("/folder/dts.dts", []);
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
        colEnd: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 8,
        len: 1,
        colEnd: 9,
      });
    });

    test("Node paths ref Node", async () => {
      mockReadFileSync("&{/node1/node2}{};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRefNode
      ).toBeTruthy();
      expect(
        parser.rootDocument.children[0].children[0] instanceof NodePathRef
      ).toBeTruthy();
      expect(
        (parser.rootDocument.children[0].children[0] as NodePathRef).path
          ?.pathParts.length
      ).toBe(2);
      expect(
        (
          parser.rootDocument.children[0].children[0] as NodePathRef
        ).path?.pathParts.map((p) => p?.name)
      ).toEqual(["node1", "node2"]);
      expect(parser.rootDocument.children[0].firstToken.pos).toEqual({
        line: 0,
        col: 0,
        len: 1,
        colEnd: 1,
      });
      expect(parser.rootDocument.children[0].lastToken.pos).toEqual({
        line: 0,
        col: 17,
        len: 1,
        colEnd: 18,
      });
    });

    test("Labeled Ref Node", async () => {
      mockReadFileSync("l1: l2: &label{};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      expect(
        parser.rootDocument.children[0] instanceof DtcRefNode
      ).toBeTruthy();
      const refNode = parser.rootDocument.children[0] as DtcRefNode;

      expect(refNode.labels.length).toEqual(2);
      expect(refNode.labels[0].label.value).toEqual("l1");
      expect(refNode.labels[1].label.value).toEqual("l2");
      expect(refNode.reference instanceof LabelRef).toBeTruthy();
      expect((refNode.reference as LabelRef).label?.value).toEqual("label");
    });

    test("Child node, no address", async () => {
      mockReadFileSync("/{node1{};};");
      const parser = new Parser("/folder/dts.dts", []);
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
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(12);
    });

    test("Child node, with coma separated addresses", async () => {
      mockReadFileSync("/{node1@20,30{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(
        (node1.children[0] as NodeName).address?.at(1)?.address
      ).toStrictEqual([0x30]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(15);
    });

    test("Child node, multiple with labels", async () => {
      mockReadFileSync("/{l1: l2: node1@20{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      expect(rootDtc.children[0] instanceof DtcChildNode).toBeTruthy();
      const node1 = rootDtc.children[0] as DtcChildNode;
      expect(node1.name?.name).toEqual("node1");
      expect(node1.name?.name);
      expect(node1.name?.address?.at(0)?.address).toEqual([0x20]);

      expect(node1.labels.length).toEqual(2);
      expect(node1.labels[0].label.value).toEqual("l1");
      expect(node1.labels[1].label.value).toEqual("l2");
    });

    test("Child node, with 0x address", async () => {
      mockReadFileSync("/{node1@0x20{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.NODE_ADDRERSS_HEX_START,
      ]);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(14);
    });

    test("Child node with address ending ULL", async () => {
      mockReadFileSync("/{node1@20ULL{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.NODE_ADDRESS_ENDS_ULL,
      ]);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x20]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(15);
    });

    test("Child node address with _", async () => {
      mockReadFileSync("/{node1@8_000_00{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(0);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(
        (node1.children[0] as NodeName).address?.at(0)?.address
      ).toStrictEqual([0x8_000_00]);
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(18);
    });

    test("Child node address unknown syntax", async () => {
      mockReadFileSync("/{node1@FOO_BAR{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.UNKNOWN_NODE_ADDRESS_SYNTAX,
      ]);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("node1");
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(17);
    });

    test("Child node, missing address", async () => {
      mockReadFileSync("/{node1@{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_ADDRESS]);
      expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
        line: 0,
        col: 7,
        len: 1,
        colEnd: 8,
      });
    });

    test("Child node, coma separated address, missing address", async () => {
      mockReadFileSync("/{node1@20,,{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(2);

      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_ADDRESS]);

      const rootDtc = parser.rootDocument.children[0];
      const node1 = rootDtc.children[0] as DtcChildNode;

      expect(node1.name?.address?.length).toEqual(3);
      expect(node1.name?.address?.at(0)?.address).toEqual([0x20]);
      expect(node1.name?.address?.at(1)?.address).toEqual([NaN]);
      expect(node1.name?.address?.at(2)?.address).toEqual([NaN]);
      expect(parser.issues[0].raw.astElement.lastToken.pos).toEqual({
        line: 0,
        col: 10,
        len: 1,
        colEnd: 11,
      });
      expect(parser.issues[1].raw.astElement.lastToken.pos).toEqual({
        line: 0,
        col: 11,
        len: 1,
        colEnd: 12,
      });
    });

    test("Child node, name starts with number", async () => {
      mockReadFileSync("/{9node1{};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.NAME_NODE_NAME_START,
      ]);
      expect(parser.rootDocument.children.length).toEqual(1);
      const rootDtc = parser.rootDocument.children[0];

      const node1 = rootDtc.children[0];
      expect(node1 instanceof DtcChildNode).toBeTruthy();
      expect(node1.children[0] instanceof NodeName).toBeTruthy();
      expect((node1.children[0] as NodeName).name).toBe("9node1");
      expect((node1.children[0] as NodeName).address).toBeUndefined();
      expect(node1.firstToken.pos.col).toEqual(2);
      expect(node1.lastToken.pos.col).toEqual(10);
    });

    test("Root node, missing name or ref", async () => {
      mockReadFileSync("{};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([
        SyntaxIssue.NODE_REF,
        SyntaxIssue.NODE_PATH_REF,
        SyntaxIssue.ROOT_NODE_NAME,
      ]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(2);
    });

    test("Ref node, no ref label", async () => {
      mockReadFileSync("&{};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.LABEL_NAME]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(0);
    });

    test("Labeled Ref node, no ref label", async () => {
      mockReadFileSync("label: &{};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.LABEL_NAME]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(7);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(7);
    });

    test("Child node, missing node name", async () => {
      mockReadFileSync("/{ {};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_NAME]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(3);
      expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(5);
    });

    test("Labeled Child node, missing node name", async () => {
      mockReadFileSync("/{ label: {};};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;
      expect(parser.issues.length).toEqual(1);
      expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_NAME]);
      expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(10);

      const rootDtc = parser.rootDocument.children[0];
      expect(rootDtc.children[0] instanceof DtcChildNode).toBeTruthy();
      expect((rootDtc.children[0] as DtcChildNode).labels[0].label.value).toBe(
        "label"
      );
    });
  });

  describe("Delete", () => {
    describe("Node", () => {
      test("with node name no address", async () => {
        mockReadFileSync("/{/delete-node/ nodeName;};");
        const parser = new Parser("/folder/dts.dts", []);
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
        const parser = new Parser("/folder/dts.dts", []);
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
          (rootDts.deleteNodes[0].nodeNameOrRef as NodeName).address?.at(0)
            ?.address
        ).toEqual([0x200]);
      });

      test("with node path ref in root node - expects node name", async () => {
        mockReadFileSync("/{/delete-node/ &{/node1/node2@200};};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_NAME]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(16);
        expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(34);
      });

      test("with label ref in root node - expects node name", async () => {
        mockReadFileSync("/{/delete-node/ &l1;};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.NODE_NAME]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(16);
        expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(18);
      });

      test("with node path ref in raw doc", async () => {
        mockReadFileSync("/delete-node/ &{/node1/node2@200};");
        const parser = new Parser("/folder/dts.dts", []);
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
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const deleteNode = parser.rootDocument.children[0] as DeleteNode;

        expect(deleteNode.nodeNameOrRef instanceof LabelRef).toBeTruthy();
        expect((deleteNode.nodeNameOrRef as LabelRef).label?.value).toEqual(
          "l1"
        );
      });

      test("missing end forad slash", async () => {
        mockReadFileSync("/{/delete-node nodeName;};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.MISSING_FORWARD_SLASH_END,
        ]);

        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          14
        );

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteNodes.length).toEqual(1);
        expect(
          rootDts.deleteNodes[0].nodeNameOrRef instanceof NodeName
        ).toBeTruthy();
        expect((rootDts.deleteNodes[0].nodeNameOrRef as NodeName).name).toEqual(
          "nodeName"
        );
      });

      test("incomplete - 1", async () => {
        mockReadFileSync("/");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.DELETE_INCOMPLETE,
        ]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
        expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(0);
      });

      test("incomplete - 2", async () => {
        mockReadFileSync("/delete-n &l1;");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.DELETE_NODE_INCOMPLETE,
        ]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(9);
      });
    });

    describe("Property", () => {
      test("Delete Property in node", async () => {
        mockReadFileSync("/{/delete-property/ prop1;};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteProperties.length).toEqual(1);
        expect(rootDts.deleteProperties[0].propertyName?.name).toEqual("prop1");
      });

      test("Delete Property in root doc", async () => {
        mockReadFileSync("/delete-property/ prop1;");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE,
        ]);
        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          24
        );
      });

      test("missing end forward slash", async () => {
        mockReadFileSync("/{/delete-property propName;};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.MISSING_FORWARD_SLASH_END,
        ]);

        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          18
        );

        const rootDts = parser.rootDocument.children[0] as DtcRootNode;

        expect(rootDts.deleteProperties.length).toEqual(1);
        expect(rootDts.deleteProperties[0].propertyName?.name).toEqual(
          "propName"
        );
      });

      test("incomplete - 1", async () => {
        mockReadFileSync("/");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.DELETE_INCOMPLETE,
        ]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(0);
        expect(parser.issues[0].raw.astElement.lastToken.pos.col).toEqual(0);
      });

      test("incomplete - 2", async () => {
        mockReadFileSync("/{/delete-p p1;};");
        const parser = new Parser("/folder/dts.dts", []);
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.DELETE_PROPERTY_INCOMPLETE,
        ]);

        expect(parser.issues[0].raw.astElement.firstToken.pos.col).toEqual(2);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          11
        );
      });
    });
  });

  describe("Comments", () => {
    test("inline", async () => {
      mockReadFileSync("    // foo bar    .");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof Comment).toBeTruthy();

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(4);
      expect(comment.lastToken.pos.col).toEqual(18);
    });

    test("with open quote inline ", async () => {
      mockReadFileSync("    // foo bar's foo    .");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof Comment).toBeTruthy();

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(4);
      expect(comment.lastToken.pos.colEnd).toEqual(25);
    });

    test("Multi line on single line ", async () => {
      mockReadFileSync("    /* foo bar */ ");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof CommentBlock).toBeTruthy();

      const comment = parser.allAstItems[0] as Comment;
      expect(comment.firstToken.pos.col).toEqual(4);
      expect(comment.lastToken.pos.col).toEqual(16);
    });

    test("Multi line on multi line", async () => {
      mockReadFileSync("    /* foo \nbar */ ");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);
      expect(parser.allAstItems.length).toEqual(1);

      expect(parser.allAstItems[0] instanceof CommentBlock).toBeTruthy();

      const commentBlock = parser.allAstItems[0] as CommentBlock;
      const commentLine1 = commentBlock.comments[0] as Comment;
      const commentLine2 = commentBlock.comments[1] as Comment;
      expect(commentLine1.firstToken.pos.col).toEqual(4);
      expect(commentLine1.firstToken.pos.line).toEqual(0);
      expect(commentLine1.lastToken.pos.colEnd).toEqual(10);

      expect(commentLine2.firstToken.pos.col).toEqual(0);
      expect(commentLine2.firstToken.pos.line).toEqual(1);
      expect(commentLine2.lastToken.pos.col).toEqual(5);
      expect(commentLine2.lastToken.pos.line).toEqual(1);
    });

    test("Multi line between elements", async () => {
      mockReadFileSync("/{prop= /* foo bar */  <10>;};");
      const parser = new Parser("/folder/dts.dts", []);
      await parser.stable;

      expect(parser.issues.length).toEqual(0);

      const commentsBlock = parser.allAstItems.filter(
        (o) => o instanceof CommentBlock
      ) as CommentBlock[];
      expect(commentsBlock.length).toEqual(1);

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

  describe("C Pre processors", () => {
    describe("#DEFINE", () => {
      test("Missing identifier", async () => {
        mockReadFileSync("#DEFINE");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.EXPECTED_IDENTIFIER_FUNCTION_LIKE,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(7);
      });

      test("Simple name", async () => {
        mockReadFileSync("#DEFINE FOO_BAR");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const cMacros = parser.allAstItems.filter(
          (o) => o instanceof CMacro
        ) as CMacro[];
        expect(cMacros.length).toEqual(1);

        const cMacro = cMacros[0];
        expect(cMacro.name).toEqual("FOO_BAR");
        expect(cMacro.tokenIndexes.start.pos.col).toEqual(0);

        expect(cMacro.tokenIndexes.end.pos.colEnd).toEqual(15);

        expect(cMacro.toString()).toEqual("FOO_BAR");
      });

      test("Function like", async () => {
        mockReadFileSync("#DEFINE ADD(a,b) a + b");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const cMacros = parser.allAstItems.filter(
          (o) => o instanceof CMacro
        ) as CMacro[];
        expect(cMacros.length).toEqual(1);

        const cMacro = cMacros[0];
        expect(cMacro.name).toEqual("ADD");
        expect(cMacro.tokenIndexes.start.pos.col).toEqual(0);

        expect(cMacro.tokenIndexes.end.pos.colEnd).toEqual(22);

        expect(cMacro.content?.toString()).toEqual("a + b");

        expect(cMacro.toString()).toEqual("ADD(a,b) a + b");
      });

      test("Multi Line like", async () => {
        mockReadFileSync("#DEFINE \\\nADD(a,b) \\\na + b");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const cMacros = parser.allAstItems.filter(
          (o) => o instanceof CMacro
        ) as CMacro[];
        expect(cMacros.length).toEqual(1);

        const cMacro = cMacros[0];
        expect(cMacro.name).toEqual("ADD");
        expect(cMacro.tokenIndexes.start.pos.col).toEqual(0);

        expect(cMacro.tokenIndexes.end.pos.line).toEqual(2);
        expect(cMacro.tokenIndexes.end.pos.colEnd).toEqual(5);

        expect(cMacro.content?.toString()).toEqual("a + b");

        expect(cMacro.toString()).toEqual("ADD(a,b) a + b");
      });

      test("Variadic function like", async () => {
        mockReadFileSync("#DEFINE ADD(a,b, ...) a + b + c + d");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const cMacros = parser.allAstItems.filter(
          (o) => o instanceof CMacro
        ) as CMacro[];
        expect(cMacros.length).toEqual(1);

        const cMacro = cMacros[0];
        expect(cMacro.name).toEqual("ADD");
        expect(cMacro.tokenIndexes.start.pos.col).toEqual(0);

        expect(cMacro.identifier instanceof FunctionDefinition).toBeTruthy();
        expect((cMacro.identifier as FunctionDefinition).params.length).toEqual(
          3
        );
        expect(
          (cMacro.identifier as FunctionDefinition).params[0] instanceof
            CIdentifier
        ).toBeTruthy();
        expect(
          (cMacro.identifier as FunctionDefinition).params[1] instanceof
            CIdentifier
        ).toBeTruthy();
        expect(
          (cMacro.identifier as FunctionDefinition).params[2] instanceof
            Variadic
        ).toBeTruthy();

        expect(cMacro.tokenIndexes.end.pos.colEnd).toEqual(35);

        expect(cMacro.content?.toString()).toEqual("a + b + c + d");

        expect(cMacro.toString()).toEqual("ADD(a,b,...) a + b + c + d");
      });

      test("Multi line", async () => {
        mockReadFileSync("#DEFINE ADD(a,b,c,d) a + b \\\n + c + d");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const cMacros = parser.allAstItems.filter(
          (o) => o instanceof CMacro
        ) as CMacro[];
        expect(cMacros.length).toEqual(1);

        const cMacro = cMacros[0];
        expect(cMacro.name).toEqual("ADD");
        expect(cMacro.tokenIndexes.start.pos.col).toEqual(0);

        expect(cMacro.tokenIndexes.end.pos.colEnd).toEqual(8);
        expect(cMacro.tokenIndexes.end.pos.line).toEqual(1);

        expect(cMacro.content?.toString()).toEqual("a + b + c + d");

        expect(cMacro.toString()).toEqual("ADD(a,b,c,d) a + b + c + d");
      });

      test("Missing comma function like", async () => {
        mockReadFileSync("#DEFINE ADD(a b) a + b");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.MISSING_COMMA,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          13
        );
      });

      test("Missing close round bracket function like - 1", async () => {
        mockReadFileSync("#DEFINE ADD(a, b a + b");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        const issues = parser.issues.filter((i) =>
          i.raw.issues.some((ii) => ii === SyntaxIssue.MISSING_ROUND_CLOSE)
        );
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([SyntaxIssue.MISSING_ROUND_CLOSE]);
        expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(18);
      });

      test("Missing close round bracket function like - 2", async () => {
        mockReadFileSync("#DEFINE FOO(");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.MISSING_ROUND_CLOSE,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
          12
        );
      });
    });

    describe("Includes", () => {
      describe("#include", () => {
        test("Include relative", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": '#include "some.dtsi"',
            "/folder/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            [],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          expect(parser.dtsIncludes.length).toEqual(1);
          expect(parser.dtsIncludes[0].path.path).toEqual("some.dtsi");

          expect(fs.existsSync).toBeCalledWith("/folder/some.dtsi");
          expect(fs.readFileSync).nthCalledWith(2, "/folder/some.dtsi");
        });
        test("Include absolute", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": "#include <my_includes/some.dtsi>",
            "/my/includes/my_includes/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            ["/my/includes"],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          expect(parser.dtsIncludes.length).toEqual(1);
          expect(parser.dtsIncludes[0].path.path).toEqual(
            "my_includes/some.dtsi"
          );

          expect(fs.existsSync).toBeCalledWith(
            "/my/includes/my_includes/some.dtsi"
          );
          expect(fs.readFileSync).nthCalledWith(
            2,
            "/my/includes/my_includes/some.dtsi"
          );
        });

        test("Include absolute", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": "#include <my_includes/some.dtsi",
            "/my/includes/my_includes/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            ["/my/includes"],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.GT_SYM]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
            31
          );
        });
      });

      describe("/include/", () => {
        test("Include relative", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": '/include/ "some.dtsi"',
            "/folder/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            [],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          expect(parser.dtsIncludes.length).toEqual(1);
          expect(parser.dtsIncludes[0].path.path).toEqual("some.dtsi");

          expect(fs.existsSync).toBeCalledWith("/folder/some.dtsi");
          expect(fs.readFileSync).nthCalledWith(2, "/folder/some.dtsi");
        });
        test("Include absolute", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": "/include/ <my_includes/some.dtsi>",
            "/my/includes/my_includes/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            ["/my/includes"],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(0);
          expect(parser.dtsIncludes.length).toEqual(1);
          expect(parser.dtsIncludes[0].path.path).toEqual(
            "my_includes/some.dtsi"
          );

          expect(fs.existsSync).toBeCalledWith(
            "/my/includes/my_includes/some.dtsi"
          );
          expect(fs.readFileSync).nthCalledWith(
            2,
            "/my/includes/my_includes/some.dtsi"
          );
        });

        test("Include absolute", async () => {
          mockReadFilesSync({
            "/folder/dts.dts": "/include/ <my_includes/some.dtsi",
            "/my/includes/my_includes/some.dtsi": "",
          });
          const parser = new CPreprocessorParser(
            "/folder/dts.dts",
            ["/my/includes"],
            new Map()
          );
          await parser.stable;
          expect(parser.issues.length).toEqual(1);
          expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.GT_SYM]);
          expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(
            32
          );
        });
      });
    });

    describe("If def", () => {
      test("Missing identifier", async () => {
        mockReadFileSync("#IFDEF\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([
          SyntaxIssue.EXPECTED_IDENTIFIER,
        ]);
        expect(parser.issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(6);
      });
      test("If def - end - false", async () => {
        mockReadFileSync("#IFDEF HELLO\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(ifDefineBlock.ifDef.identifier?.name).toEqual("HELLO");
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.col).toEqual(
          0
        );
        expect(
          ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(1);
        expect(
          ifDefineBlock.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.end.pos.line).toEqual(
          2
        );
        expect(ifDefineBlock.elseOption).toBeUndefined();
        expect(tokensToString(parser.tokens)).toEqual("");
      });

      test("If def - end - true", async () => {
        mockReadFileSync("#DEFINE HELLO\n#IFDEF HELLO\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(ifDefineBlock.ifDef.identifier?.name).toEqual("HELLO");
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.col).toEqual(
          0
        );
        expect(
          ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(2);
        expect(
          ifDefineBlock.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.end.pos.line).toEqual(
          3
        );
        expect(ifDefineBlock.elseOption).toBeUndefined();
        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("Nested - If def - end - true", async () => {
        mockReadFileSync(
          "#DEFINE HELLO\n#DEFINE AGAIN\n#IFDEF HELLO\nsome\nstuff\n#IFDEF AGAIN\nfoo\nbar\n#endif\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(2);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(ifDefineBlock.ifDef.identifier?.name).toEqual("HELLO");
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.col).toEqual(
          0
        );
        expect(
          ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(3);
        expect(
          ifDefineBlock.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(6);
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.end.pos.line).toEqual(
          8
        );
        expect(ifDefineBlock.elseOption).toBeUndefined();

        const ifDefineBlockNested = ifDefineBlocks[1];
        expect(ifDefineBlockNested.ifDef.identifier?.name).toEqual("AGAIN");
        expect(
          ifDefineBlockNested.ifDef.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockNested.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(6);
        expect(
          ifDefineBlockNested.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(3);
        expect(
          ifDefineBlockNested.ifDef.content?.tokenIndexes.end.pos.line
        ).toEqual(7);
        expect(ifDefineBlockNested.elseOption).toBeUndefined();

        expect(tokensToString(parser.tokens).trim()).toEqual(
          "some\nstuff\nfoo\nbar"
        );
      });

      test("If def - else  - end", async () => {
        mockReadFileSync("#IFDEF HELLO\nsome\nstuff\n#else\nfoo\nbar\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(ifDefineBlock.ifDef.identifier?.name).toEqual("HELLO");
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.col).toEqual(
          0
        );
        expect(
          ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(1);
        expect(
          ifDefineBlock.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.end.pos.line).toEqual(
          2
        );

        expect(
          ifDefineBlock.elseOption?.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlock.elseOption?.content?.tokenIndexes.start.pos.line
        ).toEqual(4);
        expect(
          ifDefineBlock.elseOption!.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(3);
        expect(
          ifDefineBlock.elseOption!.content?.tokenIndexes.end.pos.line
        ).toEqual(5);
        expect(tokensToString(parser.tokens).trim()).toEqual("foo\nbar");
      });

      test("Nested If def - else - end -- Use else", async () => {
        mockReadFileSync(
          `#IFDEF HELLO\n#IFDEF AGAIN\nsome\nstuff\n#else\nfoo\nbar\n#endif\n#else\n#IFDEF HELLO_AGAIN\nsome\nstuff\n#else\nfoo\nbar\n#endif\n#endif`
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(2);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);
        expect(parser.issues[1].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(2);

        const ifDefineBlockOuter = ifDefineBlocks[0];
        expect(ifDefineBlockOuter.ifDef.identifier?.name).toEqual("HELLO");
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(1);
        expect(
          ifDefineBlockOuter.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(6);
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.end.pos.line
        ).toEqual(7);

        expect(
          ifDefineBlockOuter.elseOption?.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockOuter.elseOption?.content?.tokenIndexes.start.pos.line
        ).toEqual(9);
        expect(
          ifDefineBlockOuter.elseOption!.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(6);
        expect(
          ifDefineBlockOuter.elseOption!.content?.tokenIndexes.end.pos.line
        ).toEqual(15);

        const ifDefineBlockInner = ifDefineBlocks[1];
        expect(ifDefineBlockInner.ifDef.identifier?.name).toEqual(
          "HELLO_AGAIN"
        );
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(10);
        expect(
          ifDefineBlockInner.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.end.pos.line
        ).toEqual(11);

        expect(
          ifDefineBlockInner.elseOption?.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockInner.elseOption?.content?.tokenIndexes.start.pos.line
        ).toEqual(13);
        expect(
          ifDefineBlockInner.elseOption!.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(3);
        expect(
          ifDefineBlockInner.elseOption!.content?.tokenIndexes.end.pos.line
        ).toEqual(14);

        expect(tokensToString(parser.tokens).trim()).toEqual("foo\nbar");
      });

      test("Nested If def - else - end -- Use HELLO and AGAIN", async () => {
        mockReadFileSync(
          `#DEFINE HELLO\n#DEFINE AGAIN\n#IFDEF HELLO\n#IFDEF AGAIN\nsome\nstuff\n#else\nfoo\nbar\n#endif\n#else\n#IFDEF HELLO_AGAIN
          \nsome\nstuff2\n#else\nfoo\nbar2\n#endif\n#endif`
        );

        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(2);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);
        expect(parser.issues[1].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(2);

        const ifDefineBlockOuter = ifDefineBlocks[0];
        expect(ifDefineBlockOuter.ifDef.identifier?.name).toEqual("HELLO");
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(3);
        expect(
          ifDefineBlockOuter.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(6);
        expect(
          ifDefineBlockOuter.ifDef.content?.tokenIndexes.end.pos.line
        ).toEqual(9);

        expect(
          ifDefineBlockOuter.elseOption?.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockOuter.elseOption?.content?.tokenIndexes.start.pos.line
        ).toEqual(11);
        expect(
          ifDefineBlockOuter.elseOption!.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(6);
        expect(
          ifDefineBlockOuter.elseOption!.content?.tokenIndexes.end.pos.line
        ).toEqual(18);

        const ifDefineBlockInner = ifDefineBlocks[1];
        expect(ifDefineBlockInner.ifDef.identifier?.name).toEqual("AGAIN");
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(4);
        expect(
          ifDefineBlockInner.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(
          ifDefineBlockInner.ifDef.content?.tokenIndexes.end.pos.line
        ).toEqual(5);

        expect(
          ifDefineBlockInner.elseOption?.content?.tokenIndexes.start.pos.col
        ).toEqual(0);
        expect(
          ifDefineBlockInner.elseOption?.content?.tokenIndexes.start.pos.line
        ).toEqual(7);
        expect(
          ifDefineBlockInner.elseOption!.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(3);
        expect(
          ifDefineBlockInner.elseOption!.content?.tokenIndexes.end.pos.line
        ).toEqual(8);

        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If not def - end", async () => {
        mockReadFileSync("#IFNDEF HELLO\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfDefineBlock
        ) as IfDefineBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(ifDefineBlock.ifDef.identifier?.name).toEqual("HELLO");
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.col).toEqual(
          0
        );
        expect(
          ifDefineBlock.ifDef.content?.tokenIndexes.start.pos.line
        ).toEqual(1);
        expect(
          ifDefineBlock.ifDef.content!.tokenIndexes.end.pos.colEnd
        ).toEqual(5);
        expect(ifDefineBlock.ifDef.content?.tokenIndexes.end.pos.line).toEqual(
          2
        );
        expect(ifDefineBlock.elseOption).toBeUndefined();
      });
    });

    describe("If elif", () => {
      test("If def - end - defined - false", async () => {
        mockReadFileSync("#IF defined(HELLO)\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(
          ifDefineBlock.ifBlocks[0].expression instanceof CMacroCall
        ).toBeTruthy();
        const expression = ifDefineBlock.ifBlocks[0].expression as CMacroCall;
        expect(expression.functionName.name).toEqual("defined");
        expect(expression.params[0]?.value).toEqual("HELLO");
        expect(expression.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - else - end - use else", async () => {
        mockReadFileSync(
          "#IF defined(HELLO)\nsome\nstuff\n#else\nfoo\nbar\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(
          ifDefineBlock.ifBlocks[0].expression instanceof CMacroCall
        ).toBeTruthy();
        const expression = ifDefineBlock.ifBlocks[0].expression as CMacroCall;
        expect(expression.functionName.name).toEqual("defined");
        expect(expression.params[0]?.value).toEqual("HELLO");
        expect(expression.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("foo\nbar");
      });

      test("If def - eldif - else - end - use elif", async () => {
        mockReadFileSync(
          "#DEFINE AGAIN\n#IF defined(HELLO)\nsome\nstuff\n#ELIF defined(AGAIN)\nFOOBAR\n#ELSE\nfoo\nbar\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(2);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);
        expect(parser.issues[1].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(
          ifDefineBlock.ifBlocks[0].expression instanceof CMacroCall
        ).toBeTruthy();
        const expression = ifDefineBlock.ifBlocks[0].expression as CMacroCall;
        expect(expression.functionName.name).toEqual("defined");
        expect(expression.params[0]?.value).toEqual("HELLO");
        expect(expression.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("FOOBAR");
      });

      test("If def - end - defined - true", async () => {
        mockReadFileSync(
          "#DEFINE HELLO\n#IF defined(HELLO)\nsome\nstuff\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];
        expect(
          ifDefineBlock.ifBlocks[0].expression instanceof CMacroCall
        ).toBeTruthy();
        const expression = ifDefineBlock.ifBlocks[0].expression as CMacroCall;
        expect(expression.functionName.name).toEqual("defined");
        expect(expression.params[0]?.value).toEqual("HELLO");
        expect(expression.isTrue(parser.macros)).toBeTruthy();

        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple expression - true", async () => {
        mockReadFileSync("#IF 10 < 20\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();

        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple expression - false", async () => {
        mockReadFileSync("#IF 10 > 20\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - end - simple macro expression - true", async () => {
        mockReadFileSync(
          "#DEFINE ADD(x,y) x + y\n#IF ADD(6,4) == 10\nsome\nstuff\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();

        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple long expression - false", async () => {
        mockReadFileSync("#IF 10 + 5 > 20 - 5\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - end - simple long expression - true", async () => {
        mockReadFileSync("#IF 10 + 5 == 20 - 5\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();
        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple long expression MACRO - true", async () => {
        mockReadFileSync(
          "#DEFINE ADD(x,y) x + y\n#DEFINE SUB(x,y) x - y\n#IF ADD(10, 5) == SUB(20 ,5)\nsome\nstuff\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();
        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple long expression MACRO - false", async () => {
        mockReadFileSync(
          "#DEFINE ADD(x,y) x + y\n#DEFINE SUB(x,y) x - y\n#IF ADD(10, 6) == SUB(20 ,5)\nsome\nstuff\n#endif"
        );
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();

        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - end - simple longer expression - true", async () => {
        mockReadFileSync("#IF 10 + 5 == 20 - 5 && 5 < 10\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();

        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - simple longer expression - false", async () => {
        mockReadFileSync("#IF 10 + 5 == 20 - 5 && 5 > 10\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();
        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - end - simple longer expression - false", async () => {
        mockReadFileSync("#IF 10 + 5 == 20 - 5 && 5 > 10\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();
        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });

      test("If def - end - BODMAS - true", async () => {
        mockReadFileSync("#IF 10 + 5 * 2 == 20\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(0);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeTruthy();
        expect(tokensToString(parser.tokens).trim()).toEqual("some\nstuff");
      });

      test("If def - end - BODMAS - false", async () => {
        mockReadFileSync("#IF (10 + 5) * 2 == 20\nsome\nstuff\n#endif");
        const parser = new CPreprocessorParser(
          "/folder/dts.dts",
          [],
          new Map()
        );
        await parser.stable;
        expect(parser.issues.length).toEqual(1);
        expect(parser.issues[0].raw.issues).toEqual([SyntaxIssue.UNUSED_BLOCK]);

        const ifDefineBlocks = parser.allAstItems.filter(
          (o) => o instanceof IfElIfBlock
        ) as IfElIfBlock[];
        expect(ifDefineBlocks.length).toEqual(1);

        const ifDefineBlock = ifDefineBlocks[0];

        const expression = ifDefineBlock.ifBlocks[0].expression;
        expect(expression?.isTrue(parser.macros)).toBeFalsy();
        expect(tokensToString(parser.tokens).trim()).toEqual("");
      });
    });
  });
});
