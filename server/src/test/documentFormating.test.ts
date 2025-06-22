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
    test("Labels no space", async () => {
      const documentText = "/{\n\tn1:n2:n3:node {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tn1: n2: n3: node {\n\t};\n};");
    });
    test("Labels with new lines space", async () => {
      const documentText = "/{\n\tn1:\nn2:\n\nn3:node {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tn1: n2: n3: node {\n\t};\n};");
    });
    test("labels with new line before name", async () => {
      const documentText = "/{\n\tn1:\nnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tn1: node {\n\t};\n};");
    });
    test("No space between name and { no address", async () => {
      const documentText = "/{\n\tnode{\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t};\n};");
    });

    test("No space between name and { with address", async () => {
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

  describe("Ref Node", () => {
    test("Labels no space", async () => {
      const documentText = "n1:n2:n3:&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("n1: n2: n3: &n1 {\n};");
    });
    test("Labels with new lines space", async () => {
      const documentText = "n1:\nn2:\nn3:&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("n1: n2: n3: &n1 {\n};");
    });
    test("labels with new line before referance", async () => {
      const documentText = "n1:\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("n1: &n1 {\n};");
    });
    test("No space between ref and {", async () => {
      const documentText = "&n1{\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Node extra new line from top", async () => {
      const documentText = "\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });

    test("Node two new line from top", async () => {
      const documentText = "\n\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });

    test("Node multiple new line from top", async () => {
      const documentText = "\n\n\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });

    test("Node no new line from other root", async () => {
      const documentText = "/{\n};&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n&n1 {\n};");
    });

    test("Node multiple new line from other root", async () => {
      const documentText = "/{\n};\n\n\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n&n1 {\n};");
    });

    test("Node empty new line from other root", async () => {
      const documentText = "/{\n};\n\n&n1 {\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n};\n\n&n1 {\n};");
    });

    test("Closing } on same line", async () => {
      const documentText = "&n1 {};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Closing } empty new line", async () => {
      const documentText = "&n1 {\n\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Closing } multiple new line", async () => {
      const documentText = "&n1 {\n\n\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Single space before semicolon", async () => {
      const documentText = "&n1 {\n} ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Multiple spaces before semicolon", async () => {
      const documentText = "&n1 {\n}   ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n};");
    });
    test("Comment before ;", async () => {
      const documentText = "&n1 {\n} /* abc */  ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n}; /* abc */");
    });
    test("Comments before ;", async () => {
      const documentText = "&n1 {\n} /* abc1 */     /* abc2 */   ;";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("&n1 {\n}; /* abc1 */ /* abc2 */");
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

  describe("Delete node", () => {
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

  describe("Line Comment", () => {
    test("Correct indentation in level 1", async () => {
      const documentText = "/{\n// foo\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t// foo\n\tnode {\n\t};\n};");
    });

    test("Correct indentation in level 2", async () => {
      const documentText = "/{\n\tnode {\n// foo\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t\t// foo\n\t};\n};");
    });

    test("no space", async () => {
      const documentText = "/{\n\tnode {\n\t};// foo\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t}; // foo\n};");
    });

    test("multple spaces", async () => {
      const documentText = "/{\n\tnode {\n\t};       // foo\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t}; // foo\n};");
    });
  });

  describe("Block Comment", () => {
    test("Correct indentation in level 1 single line", async () => {
      const documentText = "/{\n/* foo */\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\t/* foo */\n\tnode {\n\t};\n};");
    });

    test("Correct indentation in level 1 multi line", async () => {
      const documentText = "/{\n/* foo \n* bar\n*/\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\t/* foo \n\t* bar\n\t*/\n\tnode {\n\t};\n};"
      );
    });

    test("Correct indentation in level 2 single line", async () => {
      const documentText = "/{\n\tnode {\n/* foo */\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t\t/* foo */\n\t};\n};");
    });

    test("Correct indentation in level 2 multi line", async () => {
      const documentText = "/{\n\tnode {\n/* foo \nbar\n*/\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\tnode {\n\t\t/* foo \n\t\tbar\n\t\t*/\n\t};\n};"
      );
    });
  });

  describe("Delete property", () => {
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

  describe("Property", () => {
    test("labels no spaces property name", async () => {
      const documentText = "/{\n\tl1:l2:l3:prop1= <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tl1: l2: l3: prop1 = <10>;\n};");
    });
    test("labels with new lines spaces property name", async () => {
      const documentText = "/{\n\tl1:\nl2:\n\nl3:prop1= <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tl1: l2: l3: prop1 = <10>;\n};");
    });
    test("label with new lines before property name", async () => {
      const documentText = "/{\n\tl1:\nprop1= <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tl1: prop1 = <10>;\n};");
    });
    test("labels no spaces property value", async () => {
      const documentText = "/{\n\tprop1= <l1:l2:l3:10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <l1: l2: l3: 10>;\n};");
    });
    test("labels with new lines property value", async () => {
      const documentText = "/{\n\tprop1= <l1:\nl2:\n\nl3:10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <l1: l2: l3: 10>;\n};");
    });
    test("label with new property value", async () => {
      const documentText = "/{\n\tprop1= <l1:\n10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <l1: 10>;\n};");
    });

    test("labels no spaces property array value", async () => {
      const documentText = "/{\n\tprop1= l1:l2:l3:<10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = l1: l2: l3: <10>;\n};");
    });
    test("labels with new lines property array value", async () => {
      const documentText = "/{\n\tprop1= l1:\nl2:\n\nl3:<10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = l1: l2: l3: <10>;\n};");
    });
    test("label with new property array value", async () => {
      const documentText = "/{\n\tprop1= l1:\n<10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = l1:\n\t\t\t<10>;\n};");
    });

    test("no space before =", async () => {
      const documentText = "/{\n\tprop1= <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });

    test("multiple spaces before =", async () => {
      const documentText = "/{\n\tprop1   = <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("no space after =", async () => {
      const documentText = "/{\n\tprop1 =<10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("multiple space after =", async () => {
      const documentText = "/{\n\tprop1 =   <10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("multiple space after <", async () => {
      const documentText = "/{\n\tprop1 =   <   10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("single space between array value", async () => {
      const documentText = "/{\n\tprop1 =   <10 20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 20>;\n};");
    });
    test("multiple spaces between array value", async () => {
      const documentText = "/{\n\tprop1 =   <10    20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 20>;\n};");
    });
    test("comment between array value", async () => {
      const documentText = "/{\n\tprop1 =   <10  /* foo */  20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 /* foo */ 20>;\n};");
    });
    test("single new line between array value", async () => {
      const documentText = "/{\n\tprop1 =   <10\n20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 20>;\n};");
    });
    test("multiple new lines between array value", async () => {
      const documentText = "/{\n\tprop1 =   <10\n\n20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 20>;\n};");
    });
    test("comment and single new line between array value", async () => {
      const documentText = "/{\n\tprop1 = <10  /* foo */\n20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 /* foo */\n\t\t\t20>;\n};");
    });
    test("comment and multiple new lines between array value", async () => {
      const documentText = "/{\n\tprop1 = <10  /* foo */\n\n20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 /* foo */\n\t\t\t20>;\n};");
    });
    test("comment after <", async () => {
      const documentText = "/{\n\tprop1 = <    /* foo */    10>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = < /* foo */ 10>;\n};");
    });
    test("comment before >", async () => {
      const documentText = "/{\n\tprop1 = <10   /* foo */      >;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10 /* foo */ >;\n};");
    });
    test("multiple space before >", async () => {
      const documentText = "/{\n\tprop1 = <10   >;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("no space between comma separated values", async () => {
      const documentText = "/{\n\tprop1 = <10>,<20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>, <20>;\n};");
    });
    test("multiple spaces between comma separated values", async () => {
      const documentText = "/{\n\tprop1 = <10>,    <20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>, <20>;\n};");
    });
    test("single new line after comma separated values", async () => {
      const documentText = "/{\n\tprop1 = <10>,\n<20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>,\n\t\t\t<20>;\n};");
    });
    test("two news line after comma separated values", async () => {
      const documentText = "/{\n\tprop1 = <10>,\n\n<20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>,\n\t\t\t<20>;\n};");
    });
    test("muiltple news line after comma separated values", async () => {
      const documentText = "/{\n\tprop1 = <10>,\n\n\n<20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>,\n\t\t\t<20>;\n};");
    });
    test("comment after comma on new line", async () => {
      const documentText = "/{\n\tprop1 = <10>,\n/* foo */<20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>, /* foo */ <20>;\n};");
    });
    test("comment before comma", async () => {
      const documentText = "/{\n\tprop1 = <10>   /* foo */, <20>;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>, /* foo */ <20>;\n};");
    });
    test("multiple before ;", async () => {
      const documentText = "/{\n\tprop1 = <10>   ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("new line before ;", async () => {
      const documentText = "/{\n\tprop1 = <10>\n;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1 = <10>;\n};");
    });
    test("Correct indentation in level 1", async () => {
      const documentText = "/{\nprop1;\n\tnode {\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1;\n\tnode {\n\t};\n};");
    });

    test("Correct indentation in level 2", async () => {
      const documentText = "/{\n\tnode {\nprop1;\n\t};\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tnode {\n\t\tprop1;\n\t};\n};");
    });

    test("Single space between path and ;", async () => {
      const documentText = "/{\n\tprop1 ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1;\n};");
    });

    test("Multiple space between path and ;", async () => {
      const documentText = "/{\n\tprop1  ;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1;\n};");
    });

    test("Single comment between path and ;", async () => {
      const documentText = "/{\n\tprop1 /* abc */;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1; /* abc */\n};");
    });

    test("Multiple comments between path and ;", async () => {
      const documentText = "/{\n\tprop1 /* abc1 */  /* abc2 */;\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual("/{\n\tprop1; /* abc1 */ /* abc2 */\n};");
    });

    test("One comment after ; and multiple comments between path and ;", async () => {
      const documentText =
        "/{\n\tprop1 /* abc1 */  /* abc2 */;   /* abc3 */\n};";
      const newText = await getNewText(documentText);
      expect(newText).toEqual(
        "/{\n\tprop1; /* abc1 */ /* abc2 */ /* abc3 */\n};"
      );
    });
  });
});
