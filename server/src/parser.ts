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

import { Issue, LexerToken, SyntaxIssue, Token, TokenIndexes } from "./types";
import {
  adjacentTokens,
  createTokenIndex,
  genIssue,
  sameLine,
  validateToken,
  validateValue,
  validToken,
} from "./helpers";
import {
  DtcBaseNode,
  DtcChildNode,
  DtcRootNode,
  DtcRefNode,
  NodeName,
} from "./ast/dtc/node";
import { ASTBase } from "./ast/base";
import { Label, LabelAssign } from "./ast/dtc/label";
import { LabelRef } from "./ast/dtc/labelRef";
import { DtcProperty, PropertyName } from "./ast/dtc/property";
import { DeleteNode } from "./ast/dtc/deleteNode";
import { Keyword } from "./ast/keyword";
import { DeleteProperty } from "./ast/dtc/deleteProperty";
import { StringValue } from "./ast/dtc/values/string";
import { PropertyValue } from "./ast/dtc/values/value";
import { NodePath, NodePathRef } from "./ast/dtc/values/nodePath";
import { NumberValue } from "./ast/dtc/values/number";
import { ByteStringValue } from "./ast/dtc/values/byteString";
import { PropertyValues } from "./ast/dtc/values/values";
import { DtsDocumentVersion } from "./ast/dtc/dtsDocVersion";
import { ArrayValues } from "./ast/dtc/values/arrayValue";
import { LabeledValue } from "./ast/dtc/values/labeledValue";
import { ComplexExpression, Expression } from "./ast/cPreprocessors/expression";
import { CMacroCall, CMacroCallParam } from "./ast/cPreprocessors/functionCall";
import { BaseParser } from "./baseParser";
import { CPreprocessorParser } from "./cPreprocessorParser";
import { CMacro } from "./ast/cPreprocessors/macro";
import { getTokenizedDocumentProvider } from "./providers/tokenizedDocument";
import { Include, IncludePath } from "./ast/cPreprocessors/include";
import { existsSync } from "fs";
import { resolve, dirname } from "path";

type AllowNodeRef = "Ref" | "Name";

export class Parser extends BaseParser {
  public tokens: Token[] = [];
  cPreprocessorParser: CPreprocessorParser;

  others: ASTBase[] = [];
  rootDocument = new DtcBaseNode();
  issues: Issue<SyntaxIssue>[] = [];
  unhandledStatements = new DtcRootNode();
  private originalSortKey: number;

  constructor(
    public readonly uri: string,
    private incudes: string[],
    macros: Map<string, CMacro> = new Map<string, CMacro>(),
    private sortKey = -1
  ) {
    super();
    this.originalSortKey = sortKey;
    this.cPreprocessorParser = new CPreprocessorParser(
      this.uri,
      this.incudes,
      macros
    );
    this.rootDocument.uri = uri;
  }

  protected reset() {
    super.reset();
    this.others = [];
    this.rootDocument = new DtcBaseNode();
    this.rootDocument.uri = this.uri;
    this.issues = [];
    this.sortKey = this.originalSortKey;
    this.unhandledStatements = new DtcRootNode();
  }

  public async reparse(): Promise<void> {
    const t = performance.now();
    const stable = this.stable;
    this.parsing = new Promise<void>((resolve) => {
      stable.then(async () => {
        console.log("stable", performance.now() - t);
        this.reset();
        await this.cPreprocessorParser.reparse();
        console.log("cPreprocessorParser", performance.now() - t);
        await this.parse();
        console.log("parse done", performance.now() - t);
        resolve();
      });
    });
    return this.parsing;
  }

  async parse() {
    const t = performance.now();
    await this.cPreprocessorParser.stable;
    this.tokens = this.cPreprocessorParser.tokens;

    if (this.uri.endsWith(".h")) return;

    this.positionStack.push(0);
    if (this.tokens.length === 0) {
      return;
    }

    const process = async () => {
      if (
        !(
          this.isDtsDocumentVersion() ||
          this.isRootNodeDefinition(this.rootDocument) ||
          this.isDeleteNode(this.rootDocument, "Ref") ||
          (await this.processInclude(this.rootDocument)) ||
          // Valid use case
          this.isChildNode(this.rootDocument, "Ref") ||
          // not valid syntax but we leave this for the next layer to process
          this.isProperty(this.unhandledStatements) ||
          this.isDeleteProperty(this.unhandledStatements)
        )
      ) {
        const token = this.moveToNextToken;
        if (token) {
          const node = new ASTBase(createTokenIndex(token));
          this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
          this.reportExtraEndStatements();
        }
      }
    };

    while (!this.done) {
      await process();
    }

    this.allParsers;
    this.allAstItems.forEach((i) => (i.sortKey = this.sortKey));

    this.unhandledStatements.properties.forEach((prop) => {
      this.issues.push(genIssue(SyntaxIssue.PROPERTY_MUST_BE_IN_NODE, prop));
    });

    this.unhandledStatements.deleteProperties.forEach((delProp) => {
      this.issues.push(
        genIssue(SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE, delProp)
      );
    });

    if (this.positionStack.length !== 1) {
      /* istanbul ignore next */
      throw new Error("Incorrect final stack size");
    }
    // console.log("parse", this.uri, performance.now() - t);
  }

  private isRootNodeDefinition(parent: DtcBaseNode): boolean {
    this.enqueueToStack();

    const firstToken = this.moveToNextToken;
    let nextToken = firstToken;
    let expectedToken = LexerToken.FORWARD_SLASH;
    if (!firstToken || !validToken(firstToken, expectedToken)) {
      this.popStack();
      return false;
    }

    nextToken = this.moveToNextToken;
    expectedToken = LexerToken.CURLY_OPEN;
    if (!nextToken || !validToken(nextToken, expectedToken)) {
      this.popStack();
      return false;
    }

    // from this point we can continue an report the expected tokens
    const rootNode = new DtcRootNode();
    rootNode.openScope = nextToken;
    parent.addNodeChild(rootNode);
    this.processNode(rootNode, "Name");

    const lastToken = this.nodeEnd(rootNode) ?? nextToken;
    rootNode.firstToken = firstToken;
    rootNode.lastToken = lastToken;
    this.mergeStack();
    return true;
  }

  private nodeEnd(dtcNode: DtcBaseNode) {
    const nextToken = this.currentToken;
    if (!validToken(nextToken, LexerToken.CURLY_CLOSE)) {
      const prevToken = this.prevToken;
      if (prevToken) {
        const node = new ASTBase(createTokenIndex(prevToken));
        this.issues.push(genIssue(SyntaxIssue.CURLY_CLOSE, node));
      }

      return this.endStatement(false);
    } else {
      this.moveToNextToken;
    }

    if (this.prevToken?.value === "}") {
      dtcNode.closeScope = this.prevToken;
    }

    return this.endStatement();
  }

  private isNodeEnd() {
    return (
      validToken(this.currentToken, LexerToken.CURLY_CLOSE) ||
      validToken(this.currentToken, LexerToken.SEMICOLON)
    );
  }

  private endStatement(report = true) {
    const currentToken = this.currentToken;
    if (!validToken(currentToken, LexerToken.SEMICOLON)) {
      const token = this.prevToken;
      if (token && report) {
        const node = new ASTBase(createTokenIndex(this.prevToken));
        this.issues.push(genIssue(SyntaxIssue.END_STATEMENT, node));
        return token;
      }
    }

    this.moveToNextToken;

    this.reportExtraEndStatements();

    return currentToken;
  }

  private reportExtraEndStatements() {
    while (validToken(this.currentToken, LexerToken.SEMICOLON)) {
      const token = this.moveToNextToken;
      if (token) {
        const node = new ASTBase(createTokenIndex(token));
        this.issues.push(genIssue(SyntaxIssue.NO_STATEMENT, node));
      }
    }
  }

  private processNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
    if (this.done) return false;

    let found = false;
    let child = false;
    do {
      child =
        this.isChildNode(parent, allow) ||
        this.isProperty(parent) ||
        this.isDeleteNode(parent, allow) ||
        this.isDeleteProperty(parent);

      if (!child && !this.isNodeEnd() && !this.done) {
        const token = this.moveToNextToken;
        if (token) {
          const node = new ASTBase(createTokenIndex(token));
          this.issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
          this.reportExtraEndStatements();
        }
      } else {
        if (this.done) {
          break;
        }
      }
      found = found || child;
    } while (!this.isNodeEnd());
    return found;
  }

  private processOptionalLabelAssign(acceptLabelName = false): LabelAssign[] {
    const labels: LabelAssign[] = [];

    // Find all labels before node/property/value.....
    let labelAssign = this.isLabelAssign(acceptLabelName);
    while (labelAssign) {
      labels.push(labelAssign);
      labelAssign = this.isLabelAssign(acceptLabelName);
    }

    return labels;
  }

  private isChildNode(parentNode: DtcBaseNode, allow: AllowNodeRef): boolean {
    this.enqueueToStack();

    let omitIfNoRef: Keyword | undefined;
    if (allow === "Name") {
      omitIfNoRef = this.isOmitIfNoRefNode();
    }

    const labels = this.processOptionalLabelAssign();

    let name: NodeName | undefined;
    let ref: LabelRef | undefined;

    const child =
      allow === "Ref"
        ? new DtcRefNode(labels)
        : new DtcChildNode(labels, omitIfNoRef);

    if (allow === "Ref") {
      ref = this.isLabelRef();
    } else if (allow === "Name") {
      name = this.isNodeName();
    }

    if (!ref) {
      if (!name) {
        if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
          // could be property then ....
          this.popStack();
          return false;
        }

        child.firstToken = this.currentToken;

        this.issues.push(
          genIssue(
            allow === "Name"
              ? [SyntaxIssue.NODE_NAME]
              : [SyntaxIssue.NODE_REF, SyntaxIssue.ROOT_NODE_NAME],
            child
          )
        );
      }
    }

    let expectedNode = false;
    if (ref && child instanceof DtcRefNode) {
      child.labelReference = ref;
      expectedNode = true;
    } else if (name && child instanceof DtcChildNode) {
      expectedNode = name.address !== undefined;
      child.name = name;
    }

    if (!validToken(this.currentToken, LexerToken.CURLY_OPEN)) {
      if (expectedNode) {
        const refOrName = ref ?? name;
        if (refOrName)
          this.issues.push(genIssue(SyntaxIssue.CURLY_OPEN, refOrName));
      } else {
        // this could be a property
        this.popStack();
        return false;
      }
    } else {
      this.moveToNextToken;
      child.openScope = this.prevToken;
      // syntax must be a node ....

      let hasChild: boolean = false;
      do {
        hasChild = this.processNode(child, "Name");
      } while (hasChild);

      const lastToken = this.nodeEnd(child);

      child.lastToken = lastToken;
    }

    parentNode.addNodeChild(child);
    this.mergeStack();
    return true;
  }

  private isNodeName(): NodeName | undefined {
    this.enqueueToStack();
    const valid = this.consumeAnyConcurrentTokens(
      [
        LexerToken.DIGIT,
        LexerToken.LETTERS,
        LexerToken.COMMA,
        LexerToken.PERIOD,
        LexerToken.UNDERSCORE,
        LexerToken.ADD_OPERATOR,
        LexerToken.NEG_OPERATOR,
      ].map(validateToken)
    );

    if (!valid.length) {
      this.popStack();
      return;
    }

    const name = valid.map((v) => v.value).join("");

    if (!name.match(/^[A-Za-z]/)) {
      this.popStack();
      return;
    }

    const atValid = this.checkConcurrentTokens([validateToken(LexerToken.AT)]);
    if (atValid.length) {
      const addressValid = this.consumeAnyConcurrentTokens(
        [LexerToken.DIGIT, LexerToken.HEX].map(validateToken)
      );

      const address = addressValid.length
        ? Number.parseInt(addressValid.map((v) => v.value).join(""), 16)
        : NaN;
      const node = new NodeName(
        name,
        createTokenIndex(valid[0], addressValid.at(-1) ?? valid.at(-1)),
        address
      );

      if (!adjacentTokens(valid.at(-1), atValid[0])) {
        const whiteSpace = new ASTBase(
          createTokenIndex(valid.at(-1)!, atValid[0])
        );
        this.issues.push(genIssue(SyntaxIssue.WHITE_SPACE, whiteSpace));
      }
      if (Number.isNaN(address)) {
        this.issues.push(genIssue(SyntaxIssue.NODE_ADDRESS, node));
      }

      if (
        !Number.isNaN(address) &&
        !adjacentTokens(atValid.at(-1), addressValid[0])
      ) {
        const whiteSpace = new ASTBase(
          createTokenIndex(atValid[0], addressValid.at(0))
        );
        this.issues.push(genIssue(SyntaxIssue.WHITE_SPACE, whiteSpace));
      }

      this.mergeStack();
      return node;
    }

    const node = new NodeName(name, createTokenIndex(valid[0], valid.at(-1)));
    this.mergeStack();
    return node;
  }

  private isPropertyName(): PropertyName | undefined {
    this.enqueueToStack();
    const valid = this.consumeAnyConcurrentTokens(
      [
        LexerToken.DIGIT,
        LexerToken.LETTERS,
        LexerToken.COMMA,
        LexerToken.PERIOD,
        LexerToken.UNDERSCORE,
        LexerToken.ADD_OPERATOR,
        LexerToken.NEG_OPERATOR,
        LexerToken.QUESTION_MARK,
        LexerToken.HASH,
      ].map(validateToken)
    );

    if (!valid.length) {
      this.popStack();
      return;
    }
    const node = new PropertyName(
      valid.map((v) => v.value).join(""),
      createTokenIndex(valid[0], valid.at(-1))
    );
    this.mergeStack();
    return node;
  }

  private isLabelName(): Label | undefined {
    this.enqueueToStack();
    const valid = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
        validateToken
      )
    );

    if (!valid.length) {
      this.popStack();
      return undefined;
    }

    const name = valid.map((v) => v.value).join("");

    if (!name.match(/^[A-Za-z]/)) {
      this.popStack();
      return;
    }

    const node = new Label(name, createTokenIndex(valid[0], valid.at(-1)));
    this.mergeStack();
    return node;
  }

  private isLabelAssign(acceptLabelName: boolean): LabelAssign | undefined {
    this.enqueueToStack();
    const valid = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT, LexerToken.LETTERS, LexerToken.UNDERSCORE].map(
        validateToken
      )
    );

    if (!valid.length) {
      this.popStack();
      return;
    }

    const name = valid.map((v) => v.value).join("");

    if (!name.match(/^[A-Za-z]/)) {
      this.popStack();
      return;
    }

    const token = this.currentToken;
    const hasColon = token && validToken(token, LexerToken.COLON);
    const node = new LabelAssign(
      new Label(name, createTokenIndex(valid[0], valid.at(-1))),
      createTokenIndex(valid[0], hasColon ? token : valid.at(-1))
    );

    if (!hasColon) {
      if (acceptLabelName) {
        this.issues.push(
          genIssue(SyntaxIssue.LABEL_ASSIGN_MISSING_COLON, node)
        );
      } else {
        this.popStack();
        return;
      }
    } else {
      const lastNameToken = valid.at(-1);
      if (
        lastNameToken &&
        (token.pos.line !== node.firstToken.pos.line ||
          token.pos.col !== lastNameToken.pos.col + lastNameToken.pos.len)
      ) {
        this.issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(lastNameToken, token))
          )
        );
      }
      this.moveToNextToken;
    }

    this.mergeStack();
    return node;
  }

  private isProperty(parent: DtcBaseNode): boolean {
    this.enqueueToStack();

    const labels = this.processOptionalLabelAssign();

    const propertyName = this.isPropertyName();

    if (!propertyName) {
      this.popStack();
      return false;
    }

    if (
      validToken(this.currentToken, LexerToken.CURLY_OPEN) ||
      validToken(this.currentToken, LexerToken.AT)
    ) {
      // this is a node not a property
      this.popStack();
      return false;
    }

    const node = new DtcProperty(propertyName, labels);

    let result: PropertyValues | undefined;
    if (validToken(this.currentToken, LexerToken.ASSIGN_OPERATOR)) {
      this.moveToNextToken;
      result = this.processValue(node);

      if (!result?.values.filter((v) => !!v).length) {
        this.issues.push(genIssue(SyntaxIssue.VALUE, node));
      }
    }

    node.values = result ?? null;
    const lastToken = this.endStatement();

    // create property object
    node.lastToken = lastToken;

    parent.addNodeChild(node);

    this.mergeStack();
    return true;
  }

  private isDtsDocumentVersion(): boolean {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("d"),
      validateValue("ts"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("v"),
      validateValue("1"),
    ]);

    if (!valid.length) {
      this.popStack();
      return false;
    }

    const firstToken = valid[0];
    let token: Token | undefined = firstToken;

    if (
      valid.length === 1 &&
      !validToken(this.currentToken, LexerToken.CURLY_OPEN)
    ) {
      this.popStack();
      return false;
    }

    if (valid.length !== 6) {
      this.popStack();
      return false;
    }

    const keyword = new Keyword();
    keyword.firstToken = firstToken;
    const node = new DtsDocumentVersion(keyword);
    this.others.push(node);

    if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
      keyword.lastToken = valid.at(-1);
      this.issues.push(genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, node));
      this.mergeStack();
      return true;
    } else {
      token = this.moveToNextToken;
    }

    keyword.lastToken = token;

    node.lastToken = this.endStatement();
    this.mergeStack();
    return true;
  }

  private isOmitIfNoRefNode(): Keyword | undefined {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("omit"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("if"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("no"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("ref"),
      validateToken(LexerToken.FORWARD_SLASH),
    ]);

    if (valid.length !== 9) {
      this.popStack();
      return;
    }

    const keyword = new Keyword(createTokenIndex(valid[0], valid.at(-1)));
    this.mergeStack();
    return keyword;
  }

  private isDeleteNode(parent: DtcBaseNode, allow: AllowNodeRef): boolean {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("d"),
      validateValue("e"),
      validateValue("lete"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("node"),
    ]);

    if (!valid.length) {
      this.popStack();
      return false;
    }

    const firstToken = valid[0];
    let token: Token | undefined = firstToken;
    const keyword = new Keyword();
    keyword.firstToken = firstToken;

    if (
      valid.length === 1 &&
      !validToken(this.currentToken, LexerToken.CURLY_OPEN)
    ) {
      this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
      keyword.lastToken = valid.at(-1);
      const node = new DeleteNode(keyword);
      parent.addNodeChild(node);
      this.mergeStack();
      return true;
    }

    const stringValue = valid.map((t) => t.value ?? "").join("");

    if (!"/delete-node/".startsWith(stringValue) || stringValue.endsWith("-")) {
      this.popStack();
      return false;
    }

    keyword.lastToken = valid.at(-1);
    if ("/delete-node" !== stringValue) {
      this.issues.push(
        genIssue(
          stringValue.startsWith("/delete-n")
            ? SyntaxIssue.DELETE_NODE_INCOMPLETE
            : SyntaxIssue.DELETE_INCOMPLETE,
          keyword
        )
      );
    } else {
      if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
        this.issues.push(
          genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, keyword)
        );
      } else {
        token = this.moveToNextToken;
        keyword.lastToken = token;
      }
    }
    const node = new DeleteNode(keyword);

    if (sameLine(keyword.tokenIndexes?.end, firstToken)) {
      const nodePathRef = this.processNodePathRef();
      if (nodePathRef && allow === "Name") {
        this.issues.push(genIssue(SyntaxIssue.NODE_NAME, nodePathRef));
      }

      const labelRef = nodePathRef ? undefined : this.isLabelRef();
      if (labelRef && allow === "Name") {
        this.issues.push(genIssue(SyntaxIssue.NODE_NAME, labelRef));
      }

      const nodeName = nodePathRef || labelRef ? undefined : this.isNodeName();
      if (nodeName && allow === "Ref") {
        this.issues.push(genIssue(SyntaxIssue.NODE_REF, nodeName));
      }

      if (!nodePathRef && !nodeName && !labelRef) {
        this.issues.push(
          genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], node)
        );
      }
      node.nodeNameOrRef = nodePathRef ?? labelRef ?? nodeName ?? null;
    } else {
      if (allow === "Name") {
        this.issues.push(genIssue(SyntaxIssue.NODE_NAME, keyword));
      } else if (allow === "Ref") {
        this.issues.push(genIssue(SyntaxIssue.NODE_REF, keyword));
      }
    }
    const lastToken = this.endStatement();

    node.lastToken = lastToken;
    parent.addNodeChild(node);
    this.mergeStack();
    return true;
  }

  private isDeleteProperty(parent: DtcBaseNode): boolean {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("d"),
      validateValue("e"),
      validateValue("lete"),
      validateToken(LexerToken.NEG_OPERATOR),
      validateValue("property"),
    ]);

    if (!valid.length) {
      this.popStack();
      return false;
    }

    const firstToken = valid[0];

    let token: Token | undefined = firstToken;
    const keyword = new Keyword();
    keyword.firstToken = firstToken;

    if (
      valid.length === 1 &&
      !validToken(this.currentToken, LexerToken.CURLY_OPEN)
    ) {
      this.issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
      keyword.lastToken = valid.at(-1);
      const node = new DeleteProperty(keyword);
      parent.addNodeChild(node);
      this.mergeStack();
      return true;
    }

    const stringValue = valid.map((t) => t.value ?? "").join("");

    if (
      !"/delete-property/".startsWith(stringValue) ||
      stringValue.endsWith("-")
    ) {
      this.popStack();
      return false;
    }

    keyword.lastToken = valid.at(-1);
    if ("/delete-property" !== stringValue) {
      this.issues.push(
        genIssue(
          stringValue.startsWith("/delete-p")
            ? SyntaxIssue.DELETE_PROPERTY_INCOMPLETE
            : SyntaxIssue.DELETE_INCOMPLETE,
          keyword
        )
      );
    } else {
      if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
        this.issues.push(
          genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, keyword)
        );
      } else {
        token = this.moveToNextToken;
        keyword.lastToken = token;
      }
    }

    const node = new DeleteProperty(keyword);

    if (sameLine(keyword.tokenIndexes?.end, firstToken)) {
      const propertyName = this.isPropertyName();
      if (!propertyName) {
        this.issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, node));
      }

      node.propertyName = propertyName ?? null;
    } else {
      this.issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, keyword));
    }

    const lastToken = this.endStatement();
    node.lastToken = lastToken;
    parent.addNodeChild(node);

    this.mergeStack();
    return true;
  }

  private isNodePathRef(): PropertyValue | undefined {
    const nodePathRef = this.processNodePathRef();
    if (!nodePathRef) return;

    let endLabels: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels = this.processOptionalLabelAssign(true);

    const node = new PropertyValue(nodePathRef, [...endLabels]);
    return node;
  }

  private processValue(dtcProperty: DtcProperty): PropertyValues | undefined {
    this.enqueueToStack();

    const labels = this.processOptionalLabelAssign(true);

    const getValues = (): (PropertyValue | null)[] => {
      const getValue = () => {
        return (
          (this.processStringValue() ||
            this.isNodePathRef() ||
            this.isLabelRefValue(dtcProperty) ||
            this.arrayValues(dtcProperty) ||
            this.processByteStringValue()) ??
          null
        );
      };
      const value = getValue();

      if (!value) {
        return [];
      }

      const values = [value];
      while (!validToken(this.currentToken, LexerToken.SEMICOLON)) {
        const start = this.prevToken;
        const end = this.currentToken;
        const shouldHaveValue = validToken(this.currentToken, LexerToken.COMMA);
        if (shouldHaveValue) {
          this.moveToNextToken;
        }
        const next = getValue();
        if (end && next === null && shouldHaveValue) {
          const node = new ASTBase(createTokenIndex(end, this.currentToken));
          this.issues.push(genIssue(SyntaxIssue.VALUE, node));
        }
        if (!shouldHaveValue && next === null) {
          break;
        }
        if (start && !shouldHaveValue && next) {
          const node = new ASTBase(createTokenIndex(start));
          this.issues.push(genIssue(SyntaxIssue.MISSING_COMMA, node));
        }
        values.push(next!);
      }

      return values;
    };

    const values = getValues();

    if (values.length === 0) {
      this.popStack();
      return;
    }

    this.mergeStack();
    const node = new PropertyValues(values, labels);
    return node;
  }

  private processStringValue(): PropertyValue | undefined {
    this.enqueueToStack();

    const token = this.moveToNextToken;
    if (!validToken(token, LexerToken.STRING)) {
      this.popStack();
      return;
    }

    if (!token?.value) {
      /* istanbul ignore next */
      throw new Error("Token must have value");
    }

    let trimedValue = token.value;
    if (trimedValue.match(/["']$/)) {
      trimedValue = trimedValue.slice(1, -1);
    }
    const propValue = new StringValue(trimedValue, createTokenIndex(token));

    if (!token.value.match(/["']$/)) {
      this.issues.push(
        genIssue(
          token.value.startsWith('"')
            ? SyntaxIssue.DOUBLE_QUOTE
            : SyntaxIssue.SINGLE_QUOTE,
          propValue
        )
      );
    }

    let endLabels: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels = this.processOptionalLabelAssign(true);

    const node = new PropertyValue(propValue, endLabels);
    this.mergeStack();
    return node;
  }

  private arrayValues(dtcProperty: DtcProperty): PropertyValue | undefined {
    this.enqueueToStack();

    const firstToken = this.currentToken;
    if (!validToken(firstToken, LexerToken.LT_SYM)) {
      this.popStack();
      return;
    } else {
      this.moveToNextToken;
    }

    const value = this.processArrayValues(dtcProperty) ?? null;

    const endLabels1 = this.processOptionalLabelAssign(true) ?? [];

    const node = new PropertyValue(value, [...endLabels1]);

    if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
      this.issues.push(genIssue(SyntaxIssue.GT_SYM, node));
    } else {
      this.moveToNextToken;
    }

    let endLabels2: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels2 = this.processOptionalLabelAssign(true);

    this.mergeStack();

    node.endLabels.push(...endLabels2);
    if (!value) {
      this.issues.push(genIssue(SyntaxIssue.EXPECTED_VALUE, node));
    }
    node.firstToken = firstToken;
    node.lastToken = this.prevToken;
    return node;
  }

  private processByteStringValue(): PropertyValue | undefined {
    this.enqueueToStack();

    const firstToken = this.moveToNextToken;
    const token = firstToken;
    if (!validToken(token, LexerToken.SQUARE_OPEN)) {
      this.popStack();
      return;
    }

    const numberValues = this.processLabeledValue(() =>
      this.processHexString()
    );

    const endLabels1 = this.processOptionalLabelAssign(true) ?? [];

    numberValues.forEach((value) => {
      let len = 0;
      if (value.value?.tokenIndexes?.start === value.value?.tokenIndexes?.end) {
        len = value.value?.tokenIndexes?.start?.pos.len ?? 0;
      }

      if (len % 2 !== 0) {
        this.issues.push(genIssue(SyntaxIssue.BYTESTRING_EVEN, value));
      }
    });

    const byteString = new ByteStringValue(numberValues ?? []);
    if (byteString.values.length === 0) {
      byteString.firstToken = firstToken;
      this.issues.push(genIssue(SyntaxIssue.BYTESTRING, byteString));
    }

    const node = new PropertyValue(byteString, [...endLabels1]);

    if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
      this.issues.push(genIssue(SyntaxIssue.SQUARE_CLOSE, node));
    } else {
      this.moveToNextToken;
    }

    let endLabels2: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels2 = this.processOptionalLabelAssign(true);

    this.mergeStack();
    node.endLabels.push(...endLabels2);
    node.firstToken = firstToken;
    byteString.lastToken = this.prevToken;
    return node;
  }

  private processLabeledValue<T extends ASTBase>(
    processValue: () => LabeledValue<T> | undefined
  ): LabeledValue<T>[] {
    this.enqueueToStack();

    let value = processValue();
    let result: LabeledValue<T>[] = [];

    if (!value) {
      this.popStack();
      return [];
    }

    while (value) {
      result = [...result, value];
      value = processValue();
    }

    if (result) {
      const nextValue = processValue();
      if (nextValue) {
        result = [...result, nextValue];
      }
    }

    this.mergeStack();
    return result;
  }

  private processArrayValues(
    dtcProperty: DtcProperty
  ): ArrayValues | undefined {
    this.enqueueToStack();

    const result = this.processLabeledValue(
      ():
        | LabeledValue<NumberValue | LabelRef | NodePathRef | Expression>
        | undefined =>
        this.processRefValue(false, dtcProperty) ||
        this.processLabeledHex(false) ||
        this.processLabeledDec(false) ||
        this.processLabeledExpression(true, false)
    );

    if (result.length === 0) {
      this.popStack();
      return;
    }

    const node = new ArrayValues(result);
    this.mergeStack();
    return node;
  }

  private processLabeledHex(
    acceptLabelName: boolean
  ): LabeledValue<NumberValue> | undefined {
    this.enqueueToStack();

    const labels = this.processOptionalLabelAssign(acceptLabelName);
    const numberValue = this.processHex();
    if (!numberValue) {
      this.popStack();
      return;
    }

    const node = new LabeledValue(numberValue, labels);
    this.mergeStack();
    return node;
  }

  private processHex(): NumberValue | undefined {
    this.enqueueToStack();

    const validStart = this.checkConcurrentTokens([
      validateValue("0"),
      validateValue("x"),
    ]);

    if (validStart.length !== 2) {
      this.popStack();
      return;
    }

    const validValue = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT, LexerToken.HEX].map(validateToken)
    );

    if (!validValue.length) {
      this.popStack();
      return;
    }

    const num = Number.parseInt(validValue.map((v) => v.value).join(""), 16);
    const numberValue = new NumberValue(
      num,
      createTokenIndex(validStart[0], validValue.at(-1))
    );

    this.mergeStack();
    return numberValue;
  }

  private processHexString(): LabeledValue<NumberValue> | undefined {
    this.enqueueToStack();

    const labels = this.processOptionalLabelAssign(false);
    const valid = this.checkConcurrentTokens(
      [LexerToken.HEX, LexerToken.HEX].map(validateToken)
    );

    if (!valid.length) {
      this.popStack();
      return;
    }

    const num = Number.parseInt(valid.map((v) => v.value).join(""), 16);
    const numberValue = new NumberValue(
      num,
      createTokenIndex(valid[0], valid.at(-1))
    );

    const node = new LabeledValue(numberValue, labels);
    this.mergeStack();
    return node;
  }

  private processLabeledDec(
    acceptLabelName: boolean
  ): LabeledValue<NumberValue> | undefined {
    this.enqueueToStack();

    const labels = this.processOptionalLabelAssign(acceptLabelName);

    const numberValue = this.processDec();
    if (!numberValue) {
      this.popStack();
      return;
    }
    const node = new LabeledValue(numberValue, labels);
    this.mergeStack();
    return node;
  }

  private processDec(): NumberValue | undefined {
    this.enqueueToStack();

    const valid = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT].map(validateToken)
    );

    if (!valid.length) {
      this.popStack();
      return;
    }

    const num = Number.parseInt(valid.map((v) => v.value).join(""), 10);
    const numberValue = new NumberValue(
      num,
      createTokenIndex(valid[0], valid.at(-1))
    );

    this.mergeStack();
    return numberValue;
  }

  private processLabeledExpression(
    checkForLabels = true,
    acceptLabelName = checkForLabels
  ): LabeledValue<Expression> | undefined {
    this.enqueueToStack();

    let labels: LabelAssign[] = [];
    if (checkForLabels) {
      labels = this.processOptionalLabelAssign(acceptLabelName);
    }

    const expression = this.processExpression();

    if (!expression) {
      this.popStack();
      return;
    }

    const node = new LabeledValue(expression, labels);
    this.mergeStack();
    return node;
  }

  private isFunctionCall(): CMacroCall | undefined {
    this.enqueueToStack();
    const identifier = this.processCIdentifier();
    if (!identifier) {
      this.popStack();
      return;
    }

    const params = this.processMacroCallParams();

    if (!params) {
      this.popStack();
      return;
    }

    const node = new CMacroCall(identifier, params);
    this.mergeStack();
    return node;
  }

  private processExpression(): Expression | undefined {
    this.enqueueToStack();

    let complexExpression = false;

    let start: Token | undefined;
    let token: Token | undefined;
    if (validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
      complexExpression = true;
      start = this.moveToNextToken;
      token = start;
    }

    let expression: Expression | undefined =
      this.isFunctionCall() ||
      this.processCIdentifier() ||
      this.processHex() ||
      this.processDec();
    if (!expression) {
      this.popStack();
      return;
    }

    if (complexExpression) {
      let operator = this.isOperator();

      while (operator) {
        // complex
        const nextExpression = this.processExpression();

        if (!nextExpression) {
          this.issues.push(genIssue(SyntaxIssue.EXPECTED_EXPRESSION, operator));
        } else {
          if (expression instanceof ComplexExpression) {
            expression.addExpression(operator, nextExpression);
          } else {
            expression = new ComplexExpression(expression, {
              operator,
              expression: nextExpression,
            });
          }
        }

        operator = this.isOperator();
      }

      if (!validToken(this.currentToken, LexerToken.ROUND_CLOSE)) {
        this.issues.push(
          genIssue(SyntaxIssue.MISSING_ROUND_CLOSE, operator ?? expression)
        );
      } else {
        token = this.moveToNextToken;
      }
    }

    this.mergeStack();
    return expression;
  }

  private processMacroCallParams(): CMacroCallParam[] | undefined {
    if (!validToken(this.currentToken, LexerToken.ROUND_OPEN)) {
      return;
    }

    const block = this.parseScopedBlock(
      (token?: Token) => !!validToken(token, LexerToken.ROUND_OPEN),
      (token?: Token) => !!validToken(token, LexerToken.ROUND_CLOSE),
      (token?: Token) => !!validToken(token, LexerToken.COMMA)
    );

    return block?.splitTokens.map((param, i) => {
      const tokens = i ? param.slice(1) : param;
      return new CMacroCallParam(
        tokens
          .map((p, i) => {
            let v = p.value;
            if (p.pos.line === tokens.at(i + 1)?.pos.line) {
              v = v.padEnd(tokens[i + 1].pos.col - p.pos.col, " ");
            }
            return v;
          })
          .join(""),
        createTokenIndex(tokens[0], tokens.at(-1)),
        i
      );
    });
  }

  private isLabelRef(slxBase?: ASTBase): LabelRef | undefined {
    this.enqueueToStack();
    const ampersandToken = this.currentToken;
    if (!validToken(ampersandToken, LexerToken.AMPERSAND)) {
      this.popStack();
      return;
    } else {
      this.moveToNextToken;
    }

    const labelName = this.isLabelName();
    if (!labelName) {
      const node = new LabelRef(null);
      this.issues.push(genIssue(SyntaxIssue.LABEL_NAME, slxBase ?? node));
      node.firstToken = ampersandToken;
      this.mergeStack();
      return node;
    }

    if (
      ampersandToken &&
      (labelName.firstToken.pos.line !== ampersandToken.pos.line ||
        labelName.firstToken.pos.col !==
          ampersandToken.pos.col + ampersandToken.pos.len)
    ) {
      this.issues.push(
        genIssue(
          SyntaxIssue.WHITE_SPACE,
          new ASTBase(createTokenIndex(ampersandToken, labelName.firstToken))
        )
      );
    }

    const node = new LabelRef(labelName);
    node.firstToken = ampersandToken;
    this.mergeStack();
    return node;
  }

  private isLabelRefValue(dtcProperty: DtcProperty): PropertyValue | undefined {
    this.enqueueToStack();

    const labelRef = this.isLabelRef(dtcProperty);

    if (!labelRef) {
      this.popStack();
      return;
    }

    let endLabels: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels = this.processOptionalLabelAssign(true);

    const node = new PropertyValue(labelRef, endLabels);
    this.mergeStack();
    return node;
  }

  private processRefValue(
    acceptLabelName: boolean,
    dtcProperty: DtcProperty
  ): LabeledValue<LabelRef | NodePathRef> | undefined {
    this.enqueueToStack();
    const labels = this.processOptionalLabelAssign(acceptLabelName);
    const firstToken = this.currentToken;
    if (!validToken(this.currentToken, LexerToken.AMPERSAND)) {
      this.popStack();
      return;
    }

    const nodePath = this.processNodePathRef();

    if (nodePath !== undefined) {
      const node = new LabeledValue(nodePath, labels);
      this.mergeStack();
      return node;
    }

    const labelRef = this.isLabelRef(dtcProperty);
    if (labelRef === undefined) {
      this.issues.push(
        genIssue([SyntaxIssue.LABEL_NAME, SyntaxIssue.NODE_PATH], dtcProperty)
      );

      const node = new LabeledValue<LabelRef>(null, labels);
      node.firstToken = labels.at(0)?.firstToken ?? firstToken;
      this.mergeStack();
      return node;
    }

    const node = new LabeledValue(labelRef, labels);
    node.firstToken = labels.at(0)?.firstToken ?? firstToken;
    this.mergeStack();
    return node;
  }

  private processNodePath(
    first = true,
    nodePath = new NodePath()
  ): NodePath | undefined {
    this.enqueueToStack();

    let firstToken: Token | undefined;

    if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
      if (!first) {
        this.popStack();
        return;
      }
      if (this.prevToken) {
        this.issues.push(
          genIssue(
            SyntaxIssue.FORWARD_SLASH_START_PATH,
            new ASTBase(createTokenIndex(this.prevToken))
          )
        );
      }
    } else {
      firstToken = this.moveToNextToken;
    }

    const nodeName = this.isNodeName();
    if (!nodeName) {
      this.issues.push(
        genIssue(
          SyntaxIssue.NODE_NAME,
          new ASTBase(createTokenIndex(firstToken ?? this.prevToken!))
        )
      );
    }

    nodePath.addPath(
      nodeName ?? null,
      firstToken ? new ASTBase(createTokenIndex(firstToken)) : undefined
    );

    this.processNodePath(false, nodePath);

    this.mergeStack();
    return nodePath;
  }

  private processNodePathRef(): NodePathRef | undefined {
    this.enqueueToStack();

    const firstToken = this.moveToNextToken;
    let token = firstToken;
    if (!validToken(token, LexerToken.AMPERSAND)) {
      this.popStack();
      return;
    }

    const beforePath = this.moveToNextToken;
    token = beforePath;
    if (!validToken(token, LexerToken.CURLY_OPEN)) {
      // might be a node ref such as &nodeLabel
      this.popStack();
      return;
    }

    // now we must have a valid path
    // /soc/node/node2@223/....
    const nodePath = this.processNodePath();

    const node = new NodePathRef(nodePath ?? null);

    const lastToken = this.currentToken ?? this.prevToken;
    const afterPath = lastToken;

    nodePath?.children.forEach((p, i) => {
      if (
        i === nodePath?.children.length - 1 &&
        p &&
        afterPath &&
        p.lastToken.pos.col + p.lastToken.pos.len !== afterPath.pos.col
      ) {
        this.issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(p.lastToken, afterPath))
          )
        );
        return;
      }
      if (
        i === 0 &&
        beforePath &&
        beforePath.pos.col + beforePath.pos.len !== p?.firstToken.pos.col
      ) {
        this.issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(beforePath, p?.firstToken))
          )
        );
        return;
      }
      const nextPart = nodePath?.children[i + 1];
      if (
        p &&
        nextPart &&
        p.lastToken.pos.col + p.lastToken.pos.len !==
          nextPart?.firstToken.pos.col
      ) {
        this.issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(p.lastToken, nextPart?.firstToken))
          )
        );
      }
    });

    if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
      if (this.prevToken) {
        this.issues.push(
          genIssue(
            SyntaxIssue.CURLY_CLOSE,
            new ASTBase(createTokenIndex(this.prevToken))
          )
        );
      }
    } else {
      this.moveToNextToken;
    }

    node.firstToken = firstToken;
    node.lastToken = lastToken ?? this.prevToken;

    this.mergeStack();
    return node;
  }

  get includes() {
    return this.allAstItems.filter((i) => i instanceof Include) as Include[];
  }

  resolveInclude(include: Include) {
    if (include.path.relative) {
      return [
        resolve(dirname(this.uri), include.path.path),
        ...this.incudes.map((c) => resolve(c, include.path.path)),
      ].find((p) => existsSync(p));
    } else {
      return this.incudes
        .map((p) => resolve(p, include.path.path))
        .find((p) => existsSync(p));
    }
  }

  private async processInclude(parent: DtcBaseNode): Promise<boolean> {
    this.enqueueToStack();

    const startIndex = this.peekIndex();
    const start = this.moveToNextToken;
    let token = start;
    if (!token || !validToken(token, LexerToken.C_INCLUDE)) {
      this.popStack();
      return false;
    }

    const line = start?.pos.line;
    const keyword = new Keyword(createTokenIndex(token));

    token = this.moveToNextToken;
    const pathStart = token;
    const relative = !!validToken(token, LexerToken.STRING);
    if (!pathStart || (!relative && !validToken(token, LexerToken.LT_SYM))) {
      if (line) this.moveEndOfLine(line);
      this.mergeStack();
      return true;
    }

    let path = "";

    if (relative) {
      path = token?.value ?? "";
    } else {
      while (
        this.currentToken?.pos.line === line &&
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        path += this.currentToken?.value ?? "";
        token = this.moveToNextToken;
      }
    }

    const includePath = new IncludePath(
      path,
      relative,
      createTokenIndex(pathStart, token)
    );
    const node = new Include(keyword, includePath);
    node.uri = this.uri;
    parent.addNodeChild(node);
    node.sortKey = this.sortKey + 1;

    if (!relative) {
      if (
        this.currentToken?.pos.line !== line ||
        !validToken(this.currentToken, LexerToken.GT_SYM)
      ) {
        this.issues.push(genIssue(SyntaxIssue.GT_SYM, node));
      } else {
        token = this.moveToNextToken;
        includePath.lastToken = token;
      }
    }

    const resolvedPath = this.resolveInclude(node);
    node.reolvedPath = resolvedPath;
    if (resolvedPath && !resolvedPath.endsWith(".h")) {
      this.allAstItems.forEach((i) => (i.sortKey = this.sortKey));
      getTokenizedDocumentProvider().requestTokens(resolvedPath, true);
      const childParser = new Parser(
        resolvedPath,
        this.incudes,
        this.cPreprocessorParser.macros,
        ++this.sortKey
      );
      this.sortKey++;
      this.childParsers.push(childParser);
      await childParser.stable;
    }

    this.mergeStack();

    const endIndex = this.peekIndex();
    this.tokens.splice(startIndex, endIndex - startIndex);

    this.positionStack[this.positionStack.length - 1] = startIndex;
    return true;
  }

  get allAstItems(): ASTBase[] {
    return [
      ...this.cPreprocessorParser.allAstItems,
      ...this.rootDocument.children,
      ...this.others,
      ...this.unhandledStatements.properties,
      ...this.unhandledStatements.deleteProperties,
    ];
  }
}
