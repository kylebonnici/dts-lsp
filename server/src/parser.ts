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

import {
  Issue,
  LexerToken,
  MacroRegistryItem,
  SyntaxIssue,
  Token,
} from "./types";
import {
  adjacentTokens,
  createTokenIndex,
  genIssue,
  normalizePath,
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
  NodeAddress,
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
import { Expression } from "./ast/cPreprocessors/expression";
import { BaseParser } from "./baseParser";
import { CPreprocessorParser } from "./cPreprocessorParser";
import { Include } from "./ast/cPreprocessors/include";
import { DtsMemreserveNode } from "./ast/dtc/memreserveNode";
import { DtsBitsNode } from "./ast/dtc/bitsNode";
import { DiagnosticSeverity } from "vscode-languageserver";

type AllowNodeRef = "Ref" | "Name";

export class Parser extends BaseParser {
  public tokens: Token[] = [];
  cPreprocessorParser: CPreprocessorParser;

  others: ASTBase[] = [];
  rootDocument = new DtcBaseNode();
  unhandledStatements = new DtcRootNode();

  constructor(
    public readonly uri: string,
    private incudes: string[],
    macros?: Map<string, MacroRegistryItem>
  ) {
    super();
    this.cPreprocessorParser = new CPreprocessorParser(
      this.uri,
      this.incudes,
      macros
    );
  }

  get issues(): Issue<SyntaxIssue>[] {
    return [...this._issues, ...this.cPreprocessorParser.issues];
  }

  getFiles() {
    return [
      this.uri,
      ...(this.cPreprocessorParser.dtsIncludes
        .flatMap((include) => include.resolvedPath)
        .filter((f) => !!f) as string[]),
    ];
  }

  protected reset() {
    super.reset();
    this.others = [];
    this.rootDocument = new DtcBaseNode();
    this._issues = [];
    this.unhandledStatements = new DtcRootNode();
  }

  public async reparse(): Promise<void> {
    const t = performance.now();
    const stable = this.stable;
    this.parsing = new Promise<void>((resolve) => {
      stable.then(async () => {
        this.reset();
        await this.cPreprocessorParser.reparse();
        await this.parse();
        console.log("parsing", performance.now() - t);
        resolve();
      });
    });
    return this.parsing;
  }

  async parse() {
    const t = performance.now();
    await this.cPreprocessorParser.stable;
    this.tokens = this.cPreprocessorParser.tokens;

    if (normalizePath(this.uri).endsWith(".h")) return;

    this.positionStack.push(0);
    if (this.tokens.length === 0) {
      return;
    }

    const process = async () => {
      if (
        !(
          this.isDtsDocumentVersion() ||
          this.isMemreserve() ||
          this.isRootNodeDefinition(this.rootDocument) ||
          this.isDeleteNode(this.rootDocument, "Ref") ||
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
          this._issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
          this.reportExtraEndStatements();
        }
      }
    };

    while (!this.done) {
      await process();
    }

    this.unhandledStatements.properties.forEach((prop) => {
      this._issues.push(genIssue(SyntaxIssue.PROPERTY_MUST_BE_IN_NODE, prop));
    });

    this.unhandledStatements.deleteProperties.forEach((delProp) => {
      this._issues.push(
        genIssue(SyntaxIssue.PROPERTY_DELETE_MUST_BE_IN_NODE, delProp)
      );
    });

    if (this.positionStack.length !== 1) {
      /* istanbul ignore next */
      throw new Error("Incorrect final stack size");
    }
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
        this._issues.push(genIssue(SyntaxIssue.CURLY_CLOSE, node));
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
        this._issues.push(genIssue(SyntaxIssue.END_STATEMENT, node));
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
        this._issues.push(genIssue(SyntaxIssue.NO_STATEMENT, node));
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
          this._issues.push(genIssue(SyntaxIssue.UNKNOWN, node));
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

        this._issues.push(
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
          this._issues.push(genIssue(SyntaxIssue.CURLY_OPEN, refOrName));
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

  private processNodeAddress(): NodeAddress {
    const prevToken = this.prevToken;
    const addressValid = this.consumeAnyConcurrentTokens(
      [LexerToken.DIGIT, LexerToken.HEX].map(validateToken)
    );

    const address = addressValid.length
      ? Number.parseInt(addressValid.map((v) => v.value).join(""), 16)
      : NaN;

    if (prevToken) {
      if (Number.isNaN(address)) {
        const astNode = new ASTBase(createTokenIndex(prevToken));
        this._issues.push(genIssue(SyntaxIssue.NODE_ADDRESS, astNode));
      } else if (
        !Number.isNaN(address) &&
        !adjacentTokens(prevToken, addressValid[0])
      ) {
        const whiteSpace = new ASTBase(
          createTokenIndex(prevToken, addressValid.at(0))
        );
        this._issues.push(genIssue(SyntaxIssue.WHITE_SPACE, whiteSpace));
      }
    }

    const nodeAddress = new NodeAddress(
      address,
      createTokenIndex(addressValid[0] ?? this.prevToken, addressValid.at(-1))
    );

    return nodeAddress;
  }

  private processNodeAddresses(nodeName: NodeName): NodeAddress[] | undefined {
    this.enqueueToStack();

    const atValid = this.checkConcurrentTokens([validateToken(LexerToken.AT)]);
    if (atValid.length) {
      if (!adjacentTokens(nodeName.lastToken, atValid[0])) {
        const whiteSpace = new ASTBase(
          createTokenIndex(nodeName.lastToken!, atValid[0])
        );
        this._issues.push(genIssue(SyntaxIssue.WHITE_SPACE, whiteSpace));
      }

      const addresses: NodeAddress[] = [];
      const consumeAllAddresses = () => {
        addresses.push(this.processNodeAddress());

        if (validToken(this.currentToken, LexerToken.COMMA)) {
          if (
            this.prevToken &&
            !adjacentTokens(this.prevToken, this.currentToken)
          ) {
            const whiteSpace = new ASTBase(
              createTokenIndex(this.prevToken, this.currentToken)
            );
            this._issues.push(genIssue(SyntaxIssue.WHITE_SPACE, whiteSpace));
          }
          this.moveToNextToken;
          consumeAllAddresses();
        }
      };

      consumeAllAddresses();

      this.mergeStack();
      return addresses;
    }

    this.popStack();
    return;
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

    const node = new NodeName(name, createTokenIndex(valid[0], valid.at(-1)));
    const addresses = this.processNodeAddresses(node);
    node.address = addresses;

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
        this._issues.push(
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
        this._issues.push(
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
      node.assignOperatorToken = this.currentToken;
      this.moveToNextToken;
      result = this.processValue(node);

      if (!result?.values.filter((v) => !!v).length) {
        this._issues.push(genIssue(SyntaxIssue.VALUE, node));
      }
      node.values = result ?? null;
    } else {
      node.values = undefined;
    }

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

    if (valid.length !== 6) {
      this.popStack();
      return false;
    }

    const firstToken = valid[0];
    let token: Token | undefined = firstToken;

    const keyword = new Keyword();
    keyword.firstToken = firstToken;
    const node = new DtsDocumentVersion(keyword);
    this.others.push(node);

    if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
      keyword.lastToken = valid.at(-1);
      this._issues.push(genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, node));
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

  private isMemreserve(): boolean {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("memreserve"),
    ]);

    if (valid.length !== 2) {
      this.popStack();
      return false;
    }

    const keyword = new Keyword();
    keyword.firstToken = valid[0];

    const firstToken = valid[0];
    let token: Token | undefined = firstToken;

    if (validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
      token = this.moveToNextToken;
      keyword.lastToken = token;
    } else {
      keyword.lastToken = valid.at(-1);
      this._issues.push(
        genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, keyword)
      );
    }

    const startValue: NumberValue | undefined =
      this.processHex() || this.processDec();
    const endValue: NumberValue | undefined =
      startValue && (this.processHex() || this.processDec());

    const node = new DtsMemreserveNode(keyword, startValue, endValue);
    this.others.push(node);

    if (!startValue) {
      this._issues.push(genIssue(SyntaxIssue.EXPECTED_START_ADDRESS, keyword));
    }

    if (!endValue) {
      this._issues.push(
        genIssue(SyntaxIssue.EXPECTED_END_ADDRESS, startValue ?? keyword)
      );
    }

    node.lastToken = this.endStatement();
    this.mergeStack();
    return true;
  }

  private processBits(): DtsBitsNode | undefined {
    this.enqueueToStack();

    const valid = this.checkConcurrentTokens([
      validateToken(LexerToken.FORWARD_SLASH),
      validateValue("b"),
      validateValue("its"),
    ]);

    if (valid.length !== 3) {
      this.popStack();
      return;
    }

    const keyword = new Keyword();
    keyword.firstToken = valid[0];

    const firstToken = valid[0];
    let token: Token | undefined = firstToken;

    if (validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
      token = this.moveToNextToken;
      keyword.lastToken = token;
    } else {
      keyword.lastToken = valid.at(-1);
      this._issues.push(
        genIssue(SyntaxIssue.MISSING_FORWARD_SLASH_END, keyword)
      );
    }

    const bitsSize: NumberValue | undefined = this.processDec();

    const node = new DtsBitsNode(keyword, bitsSize);
    this.others.push(node);

    if (!bitsSize) {
      this._issues.push(genIssue(SyntaxIssue.EXPECTED_BITS_SIZE, keyword));
    } else if (
      bitsSize.value !== 8 &&
      bitsSize.value !== 16 &&
      bitsSize.value !== 32 &&
      bitsSize.value !== 64
    ) {
      this._issues.push(genIssue(SyntaxIssue.INVALID_BITS_SIZE, bitsSize));
    }

    this._issues.push(
      genIssue(
        SyntaxIssue.BITS_NON_OFFICIAL_SYNTAX,
        node,
        DiagnosticSeverity.Warning
      )
    );

    this.mergeStack();
    return node;
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
      this._issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
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
      this._issues.push(
        genIssue(
          stringValue.startsWith("/delete-n")
            ? SyntaxIssue.DELETE_NODE_INCOMPLETE
            : SyntaxIssue.DELETE_INCOMPLETE,
          keyword
        )
      );
    } else {
      if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
        this._issues.push(
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
        this._issues.push(genIssue(SyntaxIssue.NODE_NAME, nodePathRef));
      }

      const labelRef = nodePathRef ? undefined : this.isLabelRef();
      if (labelRef && allow === "Name") {
        this._issues.push(genIssue(SyntaxIssue.NODE_NAME, labelRef));
      }

      const nodeName = nodePathRef || labelRef ? undefined : this.isNodeName();
      if (nodeName && allow === "Ref") {
        this._issues.push(genIssue(SyntaxIssue.NODE_REF, nodeName));
      }

      if (!nodePathRef && !nodeName && !labelRef) {
        this._issues.push(
          genIssue([SyntaxIssue.NODE_NAME, SyntaxIssue.NODE_REF], node)
        );
      }
      node.nodeNameOrRef = nodePathRef ?? labelRef ?? nodeName ?? null;
    } else {
      if (allow === "Name") {
        this._issues.push(genIssue(SyntaxIssue.NODE_NAME, keyword));
      } else if (allow === "Ref") {
        this._issues.push(genIssue(SyntaxIssue.NODE_REF, keyword));
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
      this._issues.push(genIssue(SyntaxIssue.DELETE_INCOMPLETE, keyword));
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
      this._issues.push(
        genIssue(
          stringValue.startsWith("/delete-p")
            ? SyntaxIssue.DELETE_PROPERTY_INCOMPLETE
            : SyntaxIssue.DELETE_INCOMPLETE,
          keyword
        )
      );
    } else {
      if (!validToken(this.currentToken, LexerToken.FORWARD_SLASH)) {
        this._issues.push(
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
        this._issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, node));
      }

      node.propertyName = propertyName ?? null;
    } else {
      this._issues.push(genIssue(SyntaxIssue.PROPERTY_NAME, keyword));
    }

    const lastToken = this.endStatement();
    node.lastToken = lastToken;
    parent.addNodeChild(node);

    this.mergeStack();
    return true;
  }

  private isNodePathRef(): PropertyValue | undefined {
    this.enqueueToStack();
    const startLabels = this.processOptionalLabelAssign(true);

    const nodePathRef = this.processNodePathRef();
    if (!nodePathRef) {
      this.popStack();
      return;
    }

    const endLabels: LabelAssign[] = [];
    if (
      this.currentToken &&
      this.currentToken.pos.line === this.currentToken.prevToken?.pos.line
    )
      endLabels.push(...this.processOptionalLabelAssign(true));

    const node = new PropertyValue(startLabels, nodePathRef, endLabels);
    this.mergeStack();
    return node;
  }

  private processValue(dtcProperty: DtcProperty): PropertyValues | undefined {
    this.enqueueToStack();

    const getValues = (): (PropertyValue | null)[] => {
      const getValue = () => {
        return (
          (this.processStringValue() ||
            this.isNodePathRef() ||
            this.isLabelRefValue(dtcProperty) ||
            this.arrayValues(dtcProperty) ||
            this.processByteStringValue() ||
            this.isExpressionValue()) ??
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
        } else if (!sameLine(this.prevToken, this.currentToken)) {
          break;
        }
        const next = getValue();
        if (end && next === null && shouldHaveValue) {
          const node = new ASTBase(createTokenIndex(end, this.currentToken));
          this._issues.push(genIssue(SyntaxIssue.VALUE, node));
        }
        if (!shouldHaveValue && next === null) {
          break;
        }
        if (start && !shouldHaveValue && next) {
          const node = new ASTBase(createTokenIndex(start));
          this._issues.push(genIssue(SyntaxIssue.MISSING_COMMA, node));
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
    const node = new PropertyValues(values);
    return node;
  }

  private processStringValue(): PropertyValue | undefined {
    this.enqueueToStack();

    const startLabels = this.processOptionalLabelAssign(true);

    const token = this.moveToNextToken;
    if (!validToken(token, LexerToken.STRING)) {
      this.popStack();
      return;
    }

    if (!token?.value) {
      /* istanbul ignore next */
      throw new Error("Token must have value");
    }

    let trimmedValue = token.value;
    if (trimmedValue.match(/["']$/)) {
      trimmedValue = trimmedValue.slice(1, -1);
    }
    const propValue = new StringValue(trimmedValue, createTokenIndex(token));

    if (!token.value.match(/["']$/)) {
      this._issues.push(
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

    const node = new PropertyValue(startLabels, propValue, endLabels);
    this.mergeStack();
    return node;
  }

  private arrayValues(dtcProperty: DtcProperty): PropertyValue | undefined {
    this.enqueueToStack();

    const startLabels = this.processOptionalLabelAssign(true);
    const bits = this.processBits();

    const openBracket = this.currentToken;
    if (!validToken(openBracket, LexerToken.LT_SYM)) {
      this.popStack();
      return;
    } else {
      this.moveToNextToken;
    }

    const value = this.processArrayValues(dtcProperty) ?? null;
    value.openBracket = openBracket;

    const endLabels1 = this.processOptionalLabelAssign(true) ?? [];

    const node = new PropertyValue(startLabels, value, endLabels1, bits);

    if (!validToken(this.currentToken, LexerToken.GT_SYM)) {
      this._issues.push(genIssue(SyntaxIssue.GT_SYM, node));
    } else {
      if (value) {
        value.closeBracket = this.currentToken;
      }
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

    node.firstToken = openBracket;
    node.lastToken = this.prevToken;
    return node;
  }

  private processByteStringValue(): PropertyValue | undefined {
    this.enqueueToStack();

    const startLabels = this.processOptionalLabelAssign(true);

    const firstToken = this.moveToNextToken;
    const openBracket = firstToken;
    if (!validToken(openBracket, LexerToken.SQUARE_OPEN)) {
      this.popStack();
      return;
    }

    const numberValues = this.processLabeledValue(() =>
      this.processHexString()
    );

    const endLabels = this.processOptionalLabelAssign(true) ?? [];

    numberValues.forEach((value) => {
      let len = 0;
      if (value.value?.tokenIndexes?.start === value.value?.tokenIndexes?.end) {
        len = value.value?.tokenIndexes?.start?.pos.len ?? 0;
      }

      if (len % 2 !== 0) {
        this._issues.push(genIssue(SyntaxIssue.BYTESTRING_EVEN, value));
      }
    });

    const byteString = new ByteStringValue(numberValues ?? []);
    byteString.openBracket = openBracket;
    if (byteString.values.length === 0) {
      byteString.firstToken = firstToken;
      this._issues.push(genIssue(SyntaxIssue.BYTESTRING, byteString));
    }

    const node = new PropertyValue(startLabels, byteString, endLabels);

    if (!validToken(this.currentToken, LexerToken.SQUARE_CLOSE)) {
      this._issues.push(genIssue(SyntaxIssue.SQUARE_CLOSE, node));
    } else {
      byteString.openBracket = this.moveToNextToken;
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

  private processArrayValues(dtcProperty: DtcProperty): ArrayValues {
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

    const node = new ArrayValues(result);
    if (result.length === 0) {
      node.firstToken = this.currentToken;
    }

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

  private processLabeledExpression(
    checkForLabels = true,
    acceptLabelName = checkForLabels
  ): LabeledValue<Expression> | undefined {
    this.enqueueToStack();

    let labels: LabelAssign[] = [];
    if (checkForLabels) {
      labels = this.processOptionalLabelAssign(acceptLabelName);
    }

    const expression = this.processExpression(this.cPreprocessorParser.macros);

    if (!expression) {
      this.popStack();
      return;
    }

    const node = new LabeledValue(expression, labels);
    this.mergeStack();
    return node;
  }

  private isExpressionValue(): PropertyValue | undefined {
    this.enqueueToStack();
    const startLabels = this.processOptionalLabelAssign(false);

    const expression = this.processExpression(this.cPreprocessorParser.macros);

    if (!expression) {
      this.popStack();
      return;
    }

    const endLabels = this.processOptionalLabelAssign(true);

    const node = new PropertyValue(startLabels, expression, endLabels);

    this.mergeStack();
    return node;
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
      this._issues.push(genIssue(SyntaxIssue.LABEL_NAME, slxBase ?? node));
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
      this._issues.push(
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

    const startLabels = this.processOptionalLabelAssign(true);

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

    const node = new PropertyValue(startLabels, labelRef, endLabels);
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
      this._issues.push(
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
        this._issues.push(
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
      this._issues.push(
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

    if (first && !firstToken && nodePath.children.length === 0) {
      this.mergeStack();
      return undefined;
    }

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
        !adjacentTokens(p.lastToken, afterPath)
      ) {
        this._issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(p.lastToken, afterPath))
          )
        );
        return;
      }
      if (i === 0 && beforePath && !adjacentTokens(beforePath, p?.firstToken)) {
        this._issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(beforePath, p?.firstToken))
          )
        );
        return;
      }
      const nextPart = nodePath?.children[i + 1];
      if (p && nextPart && !adjacentTokens(p.lastToken, nextPart.firstToken)) {
        this._issues.push(
          genIssue(
            SyntaxIssue.WHITE_SPACE,
            new ASTBase(createTokenIndex(p.lastToken, nextPart?.firstToken))
          )
        );
      }
    });

    if (!validToken(lastToken, LexerToken.CURLY_CLOSE)) {
      if (this.prevToken) {
        this._issues.push(
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
