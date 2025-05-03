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
import { getFakeBindingLoader } from "./helpers";
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

const rootDefaults =
  "#address-cells=<2>; #size-cells=<1>; model=''; compatible='';";

describe("Type Issues", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  describe("Standard Types", () => {
    describe("aliases node", () => {
      test("must be child of root", async () => {
        mockReadFileSync(`/{ ${rootDefaults} node{aliases{};};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.NODE_LOCATION]);
        expect(issues[0].raw.templateStrings).toEqual([
          "Aliases node can only be added to a root node",
        ]);
      });

      test("valid node location", async () => {
        mockReadFileSync(`/{ ${rootDefaults} aliases{};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("invalid property names", async () => {
        mockReadFileSync(`/{ ${rootDefaults} aliases{abc,efg="/"};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.PROPERTY_NOT_ALLOWED,
        ]);
        expect(issues[0].raw.templateStrings).toEqual(["abc,efg"]);
      });

      test("invalid property type", async () => {
        mockReadFileSync(`/{ ${rootDefaults} aliases{abc=<1 2>};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRING,
          StandardTypeIssue.EXPECTED_U32, // phandel
        ]);
        expect(issues[0].raw.templateStrings).toEqual(["abc"]);
      });

      test("Cannot have child nodes", async () => {
        mockReadFileSync(`/{ ${rootDefaults} aliases{node{};};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.NODE_LOCATION]);
        expect(issues[0].raw.templateStrings).toEqual([
          "Aliases node can not have child nodes",
        ]);
      });
    });

    describe("memory node", () => {
      test("required", async () => {
        mockReadFileSync(`/{ ${rootDefaults} memory{};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["reg"]);
      });
    });

    describe("reserved-memory node", () => {
      test("required", async () => {
        mockReadFileSync(`/{ ${rootDefaults} reserved-memory{};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(3);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["#address-cells"]);
        expect(issues[1].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[1].raw.templateStrings).toEqual(["#size-cells"]);
        expect(issues[2].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[2].raw.templateStrings).toEqual(["ranges"]);
      });
    });

    describe("cpus node", () => {
      test("required", async () => {
        mockReadFileSync(`/{ ${rootDefaults} cpus{};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(2);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["#address-cells"]);
        expect(issues[1].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[1].raw.templateStrings).toEqual(["#size-cells"]);
      });

      test("size cells must be 0", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} cpus{#address-cells=<1>; #size-cells=<1>};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.INVALID_VALUE]);
        expect(issues[0].raw.templateStrings).toEqual([
          "#size-cells value in cpus node must be '0'",
        ]);
      });
    });

    describe("cpu node", () => {
      test("required", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} cpus{#address-cells=<1>; #size-cells=<0>; cpu{};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(2);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["reg"]);
        expect(issues[1].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[1].raw.templateStrings).toEqual(["device_type"]);
      });
    });

    describe("Status", () => {
      test("wrong value", async () => {
        mockReadFileSync(`/{ ${rootDefaults} status= "some string values"};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_ENUM]);
        expect(issues[0].raw.templateStrings).toEqual([
          ["'okay'", "'disabled'", "'reserved'", "'fail'", "'fail-sss'"].join(
            " or "
          ),
        ]);
      });

      test("wrong type", async () => {
        mockReadFileSync(`/{ ${rootDefaults} status= <10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRING,
        ]);
      });
    });

    describe("Compatible", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{ ${rootDefaults} node {compatible= <10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRINGLIST,
        ]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{ ${rootDefaults}  node{compatible= "hello";};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRING,
        ]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{ ${rootDefaults}  node {model= "hello";};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("phandle", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults}  phandle= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults}  phandle= <10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} phandle= <0x10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} phandle= <10 20>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("not unique phandel value", async () => {
        mockReadFileSync(
          `/{node1 {phandle= <1>;}; node2 {phandle= <1>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_UNIQUE_PHANDLE,
        ]);
        expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(9);
        expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(22);
      });
    });

    describe("address-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#address-cells= "hello";};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#address-cells= <10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#address-cells= <0x10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("Requiered in root node", async () => {
        mockReadFileSync(`/{#size-cells=<1>; model=''; compatible='';"};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["#address-cells"]);
      });
    });

    describe("size-cells", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= "hello";};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <0x10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} node {#size-cells= <10 20>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("Requiered in root node", async () => {
        mockReadFileSync(`/{#address-cells=<1>; model=''; compatible='';"};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
        expect(issues[0].raw.templateStrings).toEqual(["#size-cells"]);
      });
    });

    describe("reg", () => {
      test("required", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{#address-cells=<1>;#size-cells=<1>; node2@200{};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.REQUIRED]);
      });

      test("omitted", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{ node2{reg=<0x200 0x20>};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.OMITTED]);
      });

      test("length omitted", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<1>;#size-cells=<0>; node2@200{reg=<0x200>;};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= "hello";};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= < 0 512 20>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= <0 0x200 0x20>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("single values", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= < 0 512>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
      });

      test("Address mismatch - 2 size", async () => {
        mockReadFileSync(`/{${rootDefaults} node@200{reg= <0 0x300 0x20>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_ADDRESS_VALUE,
        ]);
      });

      test("Address mismatch - 1 size", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<1>;#size-cells=<2>; node2@200{reg=<0x300 0 0>;};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.MISMATCH_NODE_ADDRESS_REF_ADDRESS_VALUE,
        ]);
      });
    });

    describe("virtual-reg", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <0x10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(`/{${rootDefaults} virtual-reg= <10 20>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("ranges", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} ranges= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_EMPTY,
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} ranges;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Range fits reg size", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x20>;);};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Mapped reg exceeds mapping size", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x20>; mapped@10 {reg=<0x10 0x21>;});};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXCEEDS_MAPPING_ADDRESS,
        ]);
      });

      test("Mapped reg fits mapping size", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x20>; mapped@10 {reg=<0x10 0x20>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Mapped reg fits mapping size - 64 bit - 1", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<2>;  node@AAAAAAAABBBBBBBB {reg=<0xAAAAAAAA 0xBBBBBBBB 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0xAAAAAAAA 0xBBBBBBBB 0x20>; mapped@10 {reg=<0x10 0x20>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Mapped reg fits mapping size - 64 bit - 2", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<2>;  node@AABBBBBBBB {reg=<0xAA 0xBBBBBBBB 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0xAA 0xBBBBBBBB 0x20>; mapped@10 {reg=<0x10 0x20>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Overlapping ranges - child", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x10> <0x15 0x40 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.RANGES_OVERLAP,
        ]);
        expect(issues[0].raw.templateStrings[0]).toEqual("child");
      });

      test("Overlapping ranges - parent", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x10> <0x20 0x35 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.RANGES_OVERLAP,
        ]);
        expect(issues[0].raw.templateStrings[0]).toEqual("parent");
      });

      test("Overlapping ranges - both", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x10> <0x15 0x35 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.RANGES_OVERLAP,
        ]);
        expect(issues[0].raw.templateStrings[0]).toEqual("child and parent");
      });

      test("No Overlapping ranges", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; ranges= <0x10 0x30 0x10> <0x20 0x40 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_EMPTY,
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-ranges;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("Overlapping ranges - parent", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; dma-ranges= <0x10 0x30 0x10> <0x20 0x35 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.RANGES_OVERLAP,
        ]);
        expect(issues[0].raw.templateStrings[0]).toEqual("parent");
      });

      test("Overlapping ranges - both", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; dma-ranges= <0x10 0x30 0x10> <0x15 0x35 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.RANGES_OVERLAP,
        ]);
        expect(issues[0].raw.templateStrings[0]).toEqual("child and parent");
      });

      test("No Overlapping ranges", async () => {
        mockReadFileSync(
          `/{${rootDefaults} #address-cells=<1>;  node@30 {reg=<0x30 0x20>;#address-cells=<1>; #size-cells=<1>; dma-ranges= <0x10 0x30 0x10> <0x20 0x40 0x10>;};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_EMPTY,
        ]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-coherent;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_EMPTY,
        ]);
      });

      test("valid type empty", async () => {
        mockReadFileSync(`/{${rootDefaults} dma-noncoherent;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.tags).toEqual([DiagnosticTag.Deprecated]);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} node{device_type= <10>;};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRING,
        ]);
      });

      test("valid type single string - cpu", async () => {
        mockReadFileSync(
          `/{${rootDefaults} cpus{#address-cells=<1>;#size-cells = <0>;cpu{device_type= "cpu";reg = <0>;};};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type single string - node", async () => {
        mockReadFileSync(`/{${rootDefaults} node{device_type= "memory";};};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.tags).toEqual([DiagnosticTag.Deprecated]);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node{device_type= "cpu","hello2";};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("name", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} name= <10>;};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_STRING,
        ]);
      });

      test("valid type single string", async () => {
        mockReadFileSync(`/{${rootDefaults} name= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.DEPRECATED]);
      });

      test("valid type multiple string", async () => {
        mockReadFileSync(`/{${rootDefaults} name= "hello","hello2";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_ONE]);
      });
    });

    describe("interrupts", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("valid type one cell", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupt-controller; #interrupt-cells = <1>; node@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>;interrupts= <0x10>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupt-controller; #interrupt-cells = <2>; node@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>;interrupts= <0x30 0x40>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("unable to resolve parent - 1", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts= <10 20>};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
        ]);
      });

      test("unable to resolve parent - 2", async () => {
        mockReadFileSync(
          `/{${rootDefaults} interrupts= <10 20>; interrupt-parent=<10>};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
        ]);
      });

      test("resolve parent - explicit", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>;interrupts= <0x30 0x40 0x50>; interrupt-parent=<10>;}; node{interrupt-controller; #interrupt-cells = <3>; phandle=<10>};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
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
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });

      test("valid type dec", async () => {
        mockReadFileSync(
          `/{${rootDefaults}  phandle=<10>; interrupt-controller; #interrupt-cells= <1>; node@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>; interrupts=<0x30>; interrupt-parent= <10>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type hex ", async () => {
        mockReadFileSync(
          `/{${rootDefaults} phandle=<0x10>; interrupt-controller; #interrupt-cells= <1>; node@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>; interrupts=<0x30>; interrupt-parent= <0x10>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("multiple values", async () => {
        mockReadFileSync(
          `/{${rootDefaults} phandle=<0x10>; interrupt-controller; #interrupt-cells= <1>; node@1000000020 {#address-cells=<2>; reg = <0x10 0x20 0x30>;interrupts=<0x30>; interrupt-parent= <0x10 0x20>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.EXPECTED_U32]);
      });
    });

    describe("interrupts-extended", () => {
      test("wrong type", async () => {
        mockReadFileSync(`/{${rootDefaults} interrupts-extended= "hello";};`);
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.EXPECTED_PROP_ENCODED_ARRAY,
        ]);
      });

      test("ignore interrupt", async () => {
        mockReadFileSync(
          `/{ node1: node1@1000000020{reg=<0x10 0x20 0x30>;#address-cells=<2>; #interrupt-cells = <1>; interrupt-controller; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts = <0x30>; interrupts-extended= <&node1 0x30>;};}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([StandardTypeIssue.IGNORED]);
        expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(169);
        expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(189);
        expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(190);
        expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(225);
      });

      test("valid type single cell - label ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1: node1{#address-cells=<2>; interrupt-controller; #interrupt-cells = <1>;}; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts-extended= <&node1 0x30>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - label ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1: node1{#address-cells=<2>; interrupt-controller; #interrupt-cells = <2>;}; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts-extended= <&node1 0x30 0x40>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type single cell - node path ref", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node1{#address-cells=<2>; interrupt-controller; #interrupt-cells = <1>;}; node2@10,20{reg = <0x10 0x20 0x30>; #address-cells=<2>; interrupts-extended= <&{/node1} 0x30>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - node path ref", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{#address-cells=<2>; interrupt-controller; #interrupt-cells = <2>;}; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts-extended= <&{/node1} 0x30 0x40>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type single cell - phandle", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{#address-cells=<2>; phandle= <1>; interrupt-controller; #interrupt-cells = <1>;}; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts-extended= <1 0x30>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("valid type two cells  - phandle", async () => {
        mockReadFileSync(
          `/{ ${rootDefaults} node1{#address-cells=<2>; phandle= <1>; interrupt-controller; #interrupt-cells = <2>;}; node2@10,20{reg = <0x10 0x20 0x30>;#address-cells=<2>; interrupts-extended= <1 0x30 0x40>;};};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("unable to find phandle", async () => {
        mockReadFileSync(
          `/{  node2{#address-cells=<2>; interrupts-extended= <1 10>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.INTERRUPTS_PARENT_NODE_NOT_FOUND,
        ]);
        expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(52);
        expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(53);
      });

      test("valid type invalid cell count ", async () => {
        mockReadFileSync(
          `/{  node1{#address-cells=<2>; phandle= <1>; interrupt-controller; #interrupt-cells = <3>;}; node2{#address-cells=<2>; interrupts-extended= <1 10 20>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
        expect(issues[0].raw.astElement.firstToken.pos.col).toEqual(145);
        expect(issues[0].raw.astElement.lastToken.pos.colEnd).toEqual(147);
      });

      test("missing cell size", async () => {
        mockReadFileSync(
          `/{node1{#address-cells=<2>; phandle= <1>; }; node2{#address-cells=<2>; interrupts-extended= <1 10>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.PROPERTY_REQUIRES_OTHER_PROPERTY_IN_NODE,
        ]);
        expect(issues[0].raw.linkedTo[0].firstToken.pos.col).toEqual(2);
        expect(issues[0].raw.linkedTo[0].lastToken.pos.colEnd).toEqual(7);
        expect(issues[0].raw.templateStrings[1]).toEqual("#interrupt-cells");
      });

      test("Multiple interrupts", async () => {
        mockReadFileSync(
          `/{  node1{#address-cells=<2>; interrupt-controller; #interrupt-cells = <2>;};  node2{#address-cells=<2>; interrupt-controller; #interrupt-cells = <3>;}; node3@10,20{reg = <0x10 0x20 0x10>;#address-cells=<2>; interrupts-extended= <&{/node1} 0x30 0x40>, <&{/node2} 0x30 0x40 0x50>;}; ${rootDefaults}};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });
    });

    describe("interrupts-map-mask", () => {
      test("correct number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#interrupt-cells = <2>; interrupt-map-mask = <0x10 0x20 0x30 0x40>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("wrong number of cells - interrupt-cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#interrupt-cells = <1>; interrupt-map-mask = <0x10 0x20 0x30 0x40>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
      });

      test("wrong number of cells - address-cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#address-cells = <1>; #interrupt-cells = <2>; interrupt-map-mask = <0x10 0x20 0x30 0x40>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
      });
    });

    describe("interrupts-map", () => {
      test("correct number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} n1: node1{#address-cells=<2>; #interrupt-cells = <1>;}; node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60> <0x20 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("overlapping maps", async () => {
        mockReadFileSync(
          `/{${rootDefaults} n1: node1{#address-cells=<2>; #interrupt-cells = <1>;}; node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60>, <0x10 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.DUPLICATE_MAP_ENTRY,
        ]);
      });

      test("map resolution valid - interrupt", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node@1000000020 {reg = <0x10 0x20 0x10>; #address-cells=<2>; interrupt-parent= <&p>; interrupts=<0x30>;}; n1: node1{#address-cells=<2>; #interrupt-cells = <1>;}; p: node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60> <0x20 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("map resolution invalid - interrupt", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node@5000000020 {reg = <0x50 0x20 0x10>; #address-cells=<2>; interrupt-parent= <&p>; interrupts=<0x30>;}; n1: node1{#address-cells=<2>; #interrupt-cells = <1>;}; p: node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60> <0x20 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.NO_NEXUS_MAP_MATCH,
        ]);
      });

      test("map resolution valid - extended interrupt", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node@10,20 {#address-cells=<2>;reg = <0x10 0x20 0x10>;interrupts-extended= <&p 0x30>;}; n1: node1{#interrupt-cells = <1>;}; p: node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60> <0x20 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("map resolution invalid - extended interrupt", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node@50,20 {#address-cells=<2>; reg = <0x50 0x20 0x10>; interrupts-extended= <&p 0x30>;}; n1: node1{#interrupt-cells = <1>;}; p: node {#address-cells=<2>; #interrupt-cells = <1>; interrupt-map = <0x10 0x20 0x30 &n1 0x40 0x50 0x60> <0x20 0x20 0x30 &n1 0x40 0x50 0x60>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.NO_NEXUS_MAP_MATCH,
        ]);
      });
    });

    describe("nexus-map-mask", () => {
      test("correct number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#gpiot-cells = <2>; gpio-map-mask = <0x10 0x20>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("wrong number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#gpio-cells = <1>; gpio-map-mask = <0x10 0x20>; };`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
      });
    });

    describe("nexus-map-pass-thru", () => {
      test("correct number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#gpiot-cells = <2>; gpio-map-pass-thru = <0x10 0x20>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("wrong number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} node {#gpio-cells = <1>; gpio-map-pass-thru= <0x10 0x20>; };`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.CELL_MISS_MATCH,
        ]);
      });
    });

    describe("nexus-map", () => {
      test("correct number of cells", async () => {
        mockReadFileSync(
          `/{${rootDefaults} n1: node1{#gpio-cells = <1>;}; node {#gpio-cells = <1>; gpio-map = <0x10 &n1 0x20> <0x20 &n1 0x30>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(0);
      });

      test("overlapping maps", async () => {
        mockReadFileSync(
          `/{${rootDefaults} n1: node1{#gpio-cells = <1>;}; node {#gpio-cells = <1>; gpio-map = <0x10 &n1 0x20> <0x10 &n1 0x30>; };};`
        );
        const context = new ContextAware(
          { dtsFile: "file:///folder/dts.dts" },
          getFakeBindingLoader()
        );
        await context.parser.stable;
        const runtime = await context.getRuntime();
        const issues = runtime.typesIssues;
        expect(issues.length).toEqual(1);
        expect(issues[0].raw.issues).toEqual([
          StandardTypeIssue.DUPLICATE_MAP_ENTRY,
        ]);
      });
    });
  });
});
