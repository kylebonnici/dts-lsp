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
import { getDocumentFormatting } from "../getDocumentFormatting";
import { TextDocumentIdentifier } from "vscode-languageserver";
import { getFakeBindingLoader } from "./helpers";
import { fileURLToPath } from "url";
import { applyEdits } from "../helpers";
import { TextDocument } from "vscode-languageserver-textdocument";

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

const getEdits = async (document: TextDocument) => {
  mockReadFileSync(document.getText());
  const textDocument: TextDocumentIdentifier = {
    uri: document.uri,
  };
  const context = new ContextAware(
    { dtsFile: fileURLToPath(textDocument.uri) },
    getFakeBindingLoader()
  );
  await context.parser.stable;

  return getDocumentFormatting(
    {
      textDocument,
      options: {
        tabSize: 2,
        insertSpaces: false,
      },
    },
    context,
    document.getText().split("\n")
  );
};

const getNewText = async (documentText: string) => {
  // Create a text document
  const document = TextDocument.create(
    "file:///folder/dts.dts",
    "devicetree",
    0,
    documentText
  );
  return applyEdits(document, await getEdits(document));
};

describe("Document formating", () => {
  beforeEach(() => {
    resetTokenizedDocumentProvider();
  });

  describe("Root Node", () => {
    test("No space between / and {", async () => {
      const documentText = "/  {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Node extra new line from top", async () => {
      const documentText = "\n/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });

    test("Node two new line from top", async () => {
      const documentText = "\n\n/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });

    test("Node multiple new line from top", async () => {
      const documentText = "\n\n\n/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });

    test("Node no new line from other root", async () => {
      const documentText = "/{\n};/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n/{\n};");
    });

    test("Node multiple new line from other root", async () => {
      const documentText = "/{\n};\n\n\n/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n/{\n};");
    });

    test("Node empty new line from other root", async () => {
      const documentText = "/{\n};\n\n/{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n\n/{\n};");
    });

    test("Closing } on same line", async () => {
      const documentText = "/{};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Closing } empty new line", async () => {
      const documentText = "/{\n\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Closing } multiple new line", async () => {
      const documentText = "/{\n\n\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Single space before semicolon", async () => {
      const documentText = "/{\n} ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Multiple spaces before semicolon", async () => {
      const documentText = "/{\n}   ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};");
    });
    test("Comment before ;", async () => {
      const documentText = "/{\n} /* abc */  ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n}; /* abc */");
    });
    test("Comments before ;", async () => {
      const documentText = "/{\n} /* abc1 */     /* abc2 */   ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n}; /* abc1 */ /* abc2 */");
    });
  });

  describe("Child node", () => {
    test("No space between name and { no address", async () => {
      const documentText = "/{\n\tnode{\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("Mo space between name and { with address", async () => {
      const documentText = "/{\n\tnode@20{\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode@20 {\n\t};\n};");
    });
    test("Multiple space between name and { no address", async () => {
      const documentText = "/{\n\tnode  {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("Multiple space between name and { with address", async () => {
      const documentText = "/{\n\tnode@20  {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode@20 {\n\t};\n};");
    });

    test("Node no new line from top", async () => {
      const documentText = "/{node {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("Node one new line from top", async () => {
      const documentText = "/{\nnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("Node two new line from top", async () => {
      const documentText = "/{\n\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\n\tnode {\n\t};\n};");
    });

    test("Node more then two new line from top", async () => {
      const documentText = "/{\n\n\n\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      console.log(newText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("Node no new line from other Child", async () => {
      const documentText = "/{\n\tnode {\n\t};node {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n\tnode {\n\t};\n};");
    });

    test("Node multiple new line from other Child", async () => {
      const documentText = "/{\n\tnode {\n\t};\n\n\nnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n\tnode {\n\t};\n};");
    });

    test("Node empty new line from other Child", async () => {
      const documentText = "/{\n\tnode {\n\t};\n\nnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n\n\tnode {\n\t};\n};");
    });

    test("Closing } on same line", async () => {
      const documentText = "/{\n\tnode {};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });
    test("Closing } empty new line", async () => {
      const documentText = "/{\n\tnode {\n\n};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });
    test("Closing } multiple new line", async () => {
      const documentText = "/{\n\tnode {\n\n\n};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });
    test("Single space before semicolon", async () => {
      const documentText = "/{\n\tnode {\n\t} ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });
    test("Multiple spaces before semicolon", async () => {
      const documentText = "/{\n\tnode {\n\t}    ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });
    test("Comment before ;", async () => {
      const documentText = "/{\n\tnode {\n\t} /* abc */   ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t}; /* abc */\n};");
    });
    test("Comments before ;", async () => {
      const documentText = "/{\n\tnode {\n\t} /* abc1 */ /* abc2 */   ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t}; /* abc1 */ /* abc2 */\n};");
    });
  });

  describe("Include", () => {
    test("No space between include and path", async () => {
      const documentText = "#include<>";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("#include <>");
    });

    test("Single space between include and path", async () => {
      const documentText = "#include <>";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("#include <>");
    });

    test("Multiple spaces between include and path", async () => {
      const documentText = "#include    <>";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("#include <>");
    });

    test("Correct indentation in level 1", async () => {
      const documentText = "/{\n#include <>\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t#include <>\n\tnode {\n\t};\n};");
    });

    test("Correct indentation in level 2", async () => {
      const documentText = "/{\n\tnode {\n#include <>\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t\t#include <>\n\t};\n};");
    });
  });

  describe("delete node", () => {
    test("No space between include and path", async () => {
      const documentText = "/delete-node/&n1;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1;");
    });

    test("Single space between include and path", async () => {
      const documentText = "/delete-node/ &n1;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1;");
    });

    test("Multiple spaces between include and path", async () => {
      const documentText = "/delete-node/     &n1;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1;");
    });

    test("Correct indentation in level 1", async () => {
      const documentText = "/{\n/delete-node/ &n1;\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-node/ &n1;\n\tnode {\n\t};\n};");
    });

    test("Correct indentation in level 2", async () => {
      const documentText = "/{\n\tnode {\n/delete-node/ &n1;\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t\t/delete-node/ &n1;\n\t};\n};");
    });

    test("Single space between path and ;", async () => {
      const documentText = "/delete-node/ &n1 ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1;");
    });

    test("Multiple space between path and ;", async () => {
      const documentText = "/delete-node/ &n1   ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1;");
    });

    test("Single comment between path and ;", async () => {
      const documentText = "/delete-node/ &n1 /* abc */  ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1; /* abc */");
    });

    test("Multiple comments between path and ;", async () => {
      const documentText = "/delete-node/ &n1 /* abc1 */   /* abc2 */  ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/delete-node/ &n1; /* abc1 */ /* abc2 */");
    });

    test("One comment after ; and multiple comments between path and ;", async () => {
      const documentText =
        "/delete-node/ &n1 /* abc1 */   /* abc2 */  ; /* abc3 */";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/delete-node/ &n1; /* abc1 */ /* abc2 */ /* abc3 */"
      );
    });
  });

  describe("delete property", () => {
    test("No space between include and path", async () => {
      const documentText = "/{\n\t/delete-property/n1;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1;\n};");
    });

    test("Single space between include and path", async () => {
      const documentText = "/{\n\t/delete-property/ n1;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1;\n};");
    });

    test("Multiple spaces between include and path", async () => {
      const documentText = "/{\n\t/delete-property/ n1;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1;\n};");
    });

    test("Correct indentation in level 1", async () => {
      const documentText = "/{\n/delete-property/ n1;\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\t/delete-property/ n1;\n\tnode {\n\t};\n};"
      );
    });

    test("Correct indentation in level 2", async () => {
      const documentText = "/{\n\tnode {\n/delete-property/ n1;\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\tnode {\n\t\t/delete-property/ n1;\n\t};\n};"
      );
    });

    test("Single space between path and ;", async () => {
      const documentText = "/{\n\t/delete-property/ n1 ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1;\n};");
    });

    test("Multiple space between path and ;", async () => {
      const documentText = "/{\n\t/delete-property/ n1  ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1;\n};");
    });

    test("Single comment between path and ;", async () => {
      const documentText = "/{\n\t/delete-property/ n1 /* abc */;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/delete-property/ n1; /* abc */\n};");
    });

    test("Multiple comments between path and ;", async () => {
      const documentText =
        "/{\n\t/delete-property/ n1 /* abc1 */  /* abc2 */;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\t/delete-property/ n1; /* abc1 */ /* abc2 */\n};"
      );
    });

    test("One comment after ; and multiple comments between path and ;", async () => {
      const documentText =
        "/{\n\t/delete-property/ n1 /* abc1 */  /* abc2 */;   /* abc3 */\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\t/delete-property/ n1; /* abc1 */ /* abc2 */ /* abc3 */\n};"
      );
    });
  });
});
