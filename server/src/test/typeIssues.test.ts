/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import fs from "fs";
import { describe, test, jest, expect } from "@jest/globals";
import { StandardTypeIssue } from "../types";
import { resetTokenizedDocmentProvider } from "../providers/tokenizedDocument";
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
    describe("Status", () => {
      test("wrong value", async () => {
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

      test("wrong type", async () => {
        mockReadFileSync("/{status= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });
    });

    describe("Compatible", () => {
      test("wrong type", async () => {
        mockReadFileSync("/{compatible= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_STRINGLIST,
        ]);
      });

      test("valid type single string", async () => {
        mockReadFileSync('/{compatible= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync('/{compatible= "hello","hello2";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("model", () => {
      test("wrong type", async () => {
        mockReadFileSync("/{model= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });

      test("valid type single string", async () => {
        mockReadFileSync('/{model= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync('/{model= "hello","hello2";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("phandle", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{phandle= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{phandle= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{phandle= <0x10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync("/{phandle= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("address-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{#address-cells= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{#address-cells= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{#address-cells= <0x10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync("/{#address-cells= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("size-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{#size-cells= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{#size-cells= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{#size-cells= <0x10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync("/{#size-cells= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("reg", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{reg= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{reg= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{reg= <0x10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("two values", async () => {
        mockReadFileSync("/{reg= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync("/{reg= <10 20 30>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("virtual-reg", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{virtual-reg= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{virtual-reg= <10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{virtual-reg= <0x10>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync("/{virtual-reg= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("ranges", () => {
      test("wrong type", async () => {
        mockReadFileSync('/{ranges= "hello";};');
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_EMPTY,
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type empty", async () => {
        mockReadFileSync("/{ranges;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type dec", async () => {
        mockReadFileSync("/{ranges= <10 20 30>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync("/{ranges= <0x10 0x20 0x30>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Additional checks", async () => {
        mockReadFileSync("/{ranges= <10 20>;};");
        const context = new ContextAware("/folder/dts.dts", [], []);
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_TRIPLETS]);
      });
    });
  });
});
