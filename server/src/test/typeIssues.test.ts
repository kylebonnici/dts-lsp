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
import { StandardTypeIssue } from "../types";
import { resetTokenizedDocumentProvider } from "../providers/tokenizedDocument";
import { ContextAware } from "../runtimeEvaluator";
import { BindingLoader } from "../dtsTypes/bindings/bindingLoader";
import { getStandardType } from "../dtsTypes/standardTypes";
import { Node } from "../context/node";
import { DiagnosticTag } from "vscode-languageserver";

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

const getFakeBindingLoader = (): BindingLoader => ({
  getNodeTypes: (node: Node) => {
    return Promise.resolve([getStandardType(node)]);
  },
});

const rootDefaults =
  "#address-cells=<2>; #size-cells=<1>; model=''; compatible='';";

describe("Type Issues", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  describe("Standard Types", () => {
    describe("Status", () => {
      test("wrong value", async () => {
        mockReadFileSync(`/{ ${rootDefaults} status= "some string values"};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
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
        mockReadFileSync(`/{ ${rootDefaults} status= <10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });
    });

    describe("Compatible", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{ ${rootDefaults} node {compatible= <10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_STRINGLIST,
        ]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{ ${rootDefaults}  node{compatible= "hello";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults}  node {compatible= "hello","hello2";};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("model", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node {model= <10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{ ${rootDefaults}  node {model= "hello";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {model= "hello","hello2";};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("phandle", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults}  phandle= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults}  phandle= <10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} phandle= <0x10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} phandle= <10 20>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("not unique phandel value", async () => {
        mockReadFileSync(
          `/{node1 {phandle= <1>;}; node2 {phandle= <1>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE,
        ]);
        expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(9);
        expect(
          issues[0].linkedTo[0].lastToken.pos.col +
            issues[0].linkedTo[0].lastToken.pos.len
        ).toEqual(22);
      });
    });

    describe("address-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#address-cells= "hello";};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#address-cells= <10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#address-cells= <0x10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#address-cells= <10 20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("Requiered in root node", async () => {
        mockReadFileSync(`/{#size-cells=<1>; model=''; compatible='';"};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].templateStrings).toEqual(["#address-cells"]);
      });
    });

    describe("size-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= "hello";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <0x10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <10 20>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("Requiered in root node", async () => {
        mockReadFileSync(`/{#address-cells=<1>; model=''; compatible='';"};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].templateStrings).toEqual(["#size-cells"]);
      });
    });

    describe("reg", () => {
      test("required", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{#address-cells=<1>;#size-cells=<1>; node2@200{};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.REQUIRED]);
      });

      test("omitted", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{ node2{reg=<0x200 0x20>};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.OMITTED]);
      });

      test("length omitted", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<1>;#size-cells=<0>; node2@200{reg=<0x200>;};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Two address 3 length", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<2>;#size-cells=<3>; node2@200{reg=<0 0x200 0 0 0>;};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("One address 3 length", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<1>;#size-cells=<2>; node2@200{reg=<0x200 0 0>;};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= "hello";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= < 0 512 20>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= <0 0x200 0x20>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("single values", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= < 0 512>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.CELL_MISS_MATCH]);
      });

      test("Address mismatch - 2 size", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= <0 0x300 0x20>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
        ]);
      });

      test("Address mismatch - 1 size", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<1>;#size-cells=<2>; node2@200{reg=<0x300 0 0>;};};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_FIRST_VALUE,
        ]);
      });
    });

    describe("virtual-reg", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <0x10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <10 20>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("ranges", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} ranges= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
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
        mockReadFileSync(`/{${rootDefaults} ranges;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type dec", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node {#address-cells=<1>; #size-cells=<1>; ranges= <10 20 30>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node {#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x20 0x30>;);};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("dma-ranges", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-ranges= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
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
        mockReadFileSync(`/{${rootDefaults} dma-ranges;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type dec", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} #address-cells=<1>;  node {#address-cells=<1>; #size-cells=<1>;dma-ranges= <10 20 30>;};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node {#address-cells=<1>; #size-cells=<1>; dma-ranges= <0x10 0x20 0x30>;};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("dma-coherent", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-coherent= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_EMPTY]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-coherent;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("dma-noncoherent", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-noncoherent= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_EMPTY]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-noncoherent;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("device_type", () => {
      test("omitted", async () => {
        mockReadFileSync(`/{${rootDefaults} node{device_type= "node";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].tags).toEqual([DiagnosticTag.Deprecated]);
        expect(issues[0].issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} cpu{device_type= <10>;};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });

      test("valid type single string - cpu", async () => {
        mockReadFileSync(`/{${rootDefaults} cpu{device_type= "cpu";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues[0].tags).toEqual([DiagnosticTag.Deprecated]);
        expect(issues[0].issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("valid type single string - node", async () => {
        mockReadFileSync(`/{${rootDefaults} node{device_type= "memory";};};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].tags).toEqual([DiagnosticTag.Deprecated]);
        expect(issues[0].issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(
          `/{${rootDefaults} cpu{device_type= "cpu","hello2";};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("name", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} name= <10>;};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_STRING]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{${rootDefaults} name= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(`/{${rootDefaults} name= "hello","hello2";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("interrupts", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type single cell", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupt-controller; #interrupt-cells = <1>; node2{interrupts= <10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupt-controller; #interrupt-cells = <2>; node2{interrupts= <10 20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("unable to resolve parent - 1", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts= <10 20>};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
        ]);
      });

      test("unable to resolve parent - 2", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupts= <10 20>; interrupt-parent=<10>};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
        ]);
      });

      test("resolve parent - explicit", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} interrupts= <10 20 30>; interrupt-parent=<10>; node{interrupt-controller; #interrupt-cells = <3>; phandle=<10>};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("interrupt-parent", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupt-parent= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(
          `/{${rootDefaults}  phandle=<10>; interrupt-controller; #interrupt-cells= <1>; node{interrupts=<10>; interrupt-parent= <10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(
          `/{${rootDefaults} phandle=<0x10>; interrupt-controller; #interrupt-cells= <1>; node{interrupts=<10>; interrupt-parent= <0x10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(
          `/{${rootDefaults} phandle=<0x10>; interrupt-controller; #interrupt-cells= <1>; node{interrupts=<10>; interrupt-parent= <0x10 0x20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("interrupts-extended", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts-extended= "hello";};`);
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("ignore interrupt", async () => {
        mockReadFileSync(
          `/{ node1: node1{#interrupt-cells = <1>; interrupt-controller; node2{interrupts = <10>; interrupts-extended= <&node1 10>;};}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([StandardTypeIssue.IGNORED]);
        expect(issues[0].astElement.firstToken.pos.col).toEqual(68);
        expect(
          issues[0].astElement.lastToken.pos.col +
            issues[0].astElement.lastToken.pos.len
        ).toEqual(86);
        expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(87);
        expect(
          issues[0].linkedTo[0].lastToken.pos.col +
            issues[0].linkedTo[0].lastToken.pos.len
        ).toEqual(120);
      });

      test("valid type single cell - label ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1: node1{interrupt-controller; #interrupt-cells = <1>;}; node2{interrupts-extended= <&node1 10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - label ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} #address-cells=<1>; #size-cells=<1>; model=''; compatible='';  node1: node1{interrupt-controller; #interrupt-cells = <2>;}; node2{interrupts-extended= <&node1 10 20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type single cell - node path ref", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{interrupt-controller; #interrupt-cells = <1>;}; node2{interrupts-extended= <&{/node1} 10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - node path ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{interrupt-controller; #interrupt-cells = <2>;}; node2{interrupts-extended= <&{/node1} 10 20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type single cell - phandle", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{phandle= <1>; interrupt-controller; #interrupt-cells = <1>;}; node2{interrupts-extended= <1 10>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - phandle", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{phandle= <1>; interrupt-controller; #interrupt-cells = <2>;}; node2{interrupts-extended= <1 10 20>;};};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("unable to find phandle", async () => {
        mockReadFileSync(
          `/{  node2{interrupts-extended= <1 10>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
        ]);
        expect(issues[0].astElement.firstToken.pos.col).toEqual(32);
        expect(
          issues[0].astElement.lastToken.pos.col +
            issues[0].astElement.lastToken.pos.len
        ).toEqual(33);
      });

      test("valid type invalid cell count ", async () => {
        mockReadFileSync(
          `/{  node1{phandle= <1>; interrupt-controller; #interrupt-cells = <3>;}; node2{interrupts-extended= <1 10 20>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.INTERRUPTS_VALUE_CELL_MISS_MATCH,
        ]);
        expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(46);
        expect(
          issues[0].linkedTo[0].lastToken.pos.col +
            issues[0].linkedTo[0].lastToken.pos.len
        ).toEqual(69);
        expect(issues[0].templateStrings[1]).toEqual("3");
      });

      test("missing cell size", async () => {
        mockReadFileSync(
          `/{node1{phandle= <1>; }; node2{interrupts-extended= <1 10>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].issues).toEqual([
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
        ]);
        expect(issues[0].linkedTo[0].firstToken.pos.col).toEqual(2);
        expect(
          issues[0].linkedTo[0].lastToken.pos.col +
            issues[0].linkedTo[0].lastToken.pos.len
        ).toEqual(7);
        expect(issues[0].templateStrings[1]).toEqual("#interrupt-cells");
      });

      test("Multiple interrupts", async () => {
        mockReadFileSync(
          `/{  node1{interrupt-controller; #interrupt-cells = <2>;};  node2{interrupt-controller; #interrupt-cells = <3>;}; node3{interrupts-extended= <&{/node1} 10 20>, <&{/node2} 10 20 30>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          "/folder/dts.dts",
          [],
          getFakeBindingLoader(),
          []
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });
  });
});
