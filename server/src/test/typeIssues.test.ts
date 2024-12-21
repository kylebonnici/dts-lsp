/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import { Parser } from "../parser";
import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { StandardTypeIssue, SyntaxIssue } from "../types";
import {
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
  NodeName,
} from "../ast/dtc/node";
import { DtcProperty } from "../ast/dtc/property";
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
import { IfDefineBlock } from "../ast/cPreprocessors/ifDefine";
import { CPreprocessorParser } from "../cPreprocessorParser";
import { DtsDocumentVersion } from "../ast/dtc/dtsDocVersion";
import { CMacroCall } from "../ast/cPreprocessors/functionCall";
import { ComplexExpression } from "../ast/cPreprocessors/expression";
import { CIdentifier } from "../ast/cPreprocessors/cIdentifier";
import { CMacro } from "../ast/cPreprocessors/macro";
import {
  FunctionDefinition,
  Variadic,
} from "../ast/cPreprocessors/functionDefinition";
import { ContextAware } from "../runtimeEvaluator";

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

describe("Type Issues", () => {
  beforeEach(() => {
    resetTokenizedDocmentProvider();
  });

  describe("Standard Types", () => {
    test("status wrong value", async () => {
      mockReadFileSync('/{status= "some string values"};');
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const runtime = await context.getRuntime();
      const issues = runtime.typesIssues;
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_ENUM]);
      expect(issues[0].templateStrings).toEqual([
        ["'okay'", "'disabled'", "'reserved'", "'fail'", "'fail-sss'"].join(
          " or "
        ),
      ]);
    });

    test("status wrong type", async () => {
      mockReadFileSync("/{status= <10>;};");
      const context = new ContextAware("/folder/dts.dts", [], []);
      await context.parser.stable;
      const runtime = await context.getRuntime();
      const issues = runtime.typesIssues;
      expect(issues.length).toEqual(1);
      expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
    });
  });
});
