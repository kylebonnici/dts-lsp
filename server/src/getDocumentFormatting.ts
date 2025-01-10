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
  DocumentFormattingParams,
  Position,
  Range,
  TextEdit,
} from "vscode-languageserver";
import { ContextAware } from "./runtimeEvaluator";
import { DtcBaseNode, DtcChildNode, DtcRefNode } from "./ast/dtc/node";
import { DtcProperty } from "./ast/dtc/property";
import { DeleteBase } from "./ast/dtc/delete";
import { ASTBase } from "./ast/base";
import { Token } from "./types";
import { PropertyValues } from "./ast/dtc/values/values";
import { PropertyValue } from "./ast/dtc/values/value";
import { AllValueType } from "./ast/dtc/types";
import { ArrayValues } from "./ast/dtc/values/arrayValue";
import { ByteStringValue } from "./ast/dtc/values/byteString";
import { LabeledValue } from "./ast/dtc/values/labeledValue";
import { Include } from "./ast/cPreprocessors/include";
import { nodeFinder } from "./helpers";
import { Property } from "./context/property";
import { Node } from "./context/node";

const closestNode = async (
  token: Token,
  context: ContextAware,
  uri: string
) => {
  return (
    await nodeFinder(
      {
        textDocument: { uri },
        position: Position.create(token.pos.line, token.pos.col),
      },
      [context],
      (result) => {
        const node =
          result?.item instanceof Property ? result.item.parent : result?.item;

        return node ? [node] : [];
      }
    )
  ).at(0);
};
const getAstItemLevel =
  (context: ContextAware, uri: string) => async (astNode: ASTBase) => {
    const prevClosestNode = astNode.firstToken.prevToken
      ? await closestNode(astNode.firstToken.prevToken, context, uri)
      : undefined;
    const nextClosestNode = astNode.lastToken.nextToken
      ? await closestNode(astNode.lastToken.nextToken, context, uri)
      : undefined;

    const countParent = (node: Node, count = 0): number => {
      return node.parent ? countParent(node.parent, count + 1) : count + 1;
    };

    if (prevClosestNode && prevClosestNode === nextClosestNode) {
      const count = countParent(prevClosestNode);
      return count;
    }

    return 0;
  };

export async function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware
): Promise<TextEdit[]> {
  const uri = documentFormattingParams.textDocument.uri.replace("file://", "");
  const parser = (await contextAware.getAllParsers()).find((p) =>
    p.getFiles().some((u) => uri === u)
  );

  return parser
    ? (
        await Promise.all(
          parser.allAstItems.flatMap(
            async (base) =>
              await getTextEdit(
                documentFormattingParams,
                base,
                uri,
                getAstItemLevel(contextAware, uri)
              )
          )
        )
      ).flat()
    : [];
}

const removeNewLinesBetweenTokenAndPrev = (
  token: Token,
  expectedNewLines = 1
): TextEdit | undefined => {
  if (token.prevToken) {
    const diffNumberOfLins = token.pos.line - token.prevToken.pos.line;
    const linesToRemove = diffNumberOfLins - expectedNewLines;

    if (
      linesToRemove &&
      ((diffNumberOfLins !== 2 && expectedNewLines !== 0) ||
        expectedNewLines === 0)
    ) {
      return TextEdit.replace(
        Range.create(
          Position.create(
            token.prevToken.pos.line,
            token.prevToken.pos.col + token.prevToken.pos.len
          ),
          Position.create(token.pos.line - expectedNewLines, token.pos.col)
        ),
        "".padEnd(expectedNewLines - 1, "\n")
      );
    }
  }
};

const pushItemToNewLine = (
  token: Token,
  level: number,
  indentString: string
): TextEdit | undefined => {
  const newLine = token.pos.line === token.prevToken?.pos.line;

  if (newLine) {
    return TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.col),
        Position.create(token.pos.line, token.pos.col)
      ),
      `\n${"".padStart(level * indentString.length, indentString)}`
    );
  }
};

const createIndentEdit = (
  token: Token,
  level: number,
  indentString: string
): TextEdit => {
  return TextEdit.replace(
    Range.create(
      Position.create(token.pos.line, 0),
      Position.create(token.pos.line, token.pos.col)
    ),
    "".padStart(level * indentString.length, indentString)
  );
};

const fixedNumberOfSpaceBetweenTokensAndNext = (
  token: Token,
  expectedSpaces = 1
): TextEdit[] => {
  if (!token.nextToken) return [];
  if (token.nextToken?.pos.line !== token.pos.line) {
    const removeNewLinesEdit = removeNewLinesBetweenTokenAndPrev(
      token.nextToken,
      0
    );
    if (!removeNewLinesEdit) {
      throw new Error("remove new LinesEdit must be defined");
    }
    return [
      TextEdit.insert(
        Position.create(token.pos.line, token.pos.col + token.pos.len),
        "".padEnd(expectedSpaces, " ")
      ),
      removeNewLinesEdit,
    ];
  }

  const numberOfWhiteSpace =
    token.nextToken.pos.col - (token.pos.col + token.pos.len);

  if (numberOfWhiteSpace === expectedSpaces) return [];

  return [
    TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.col + token.pos.len),
        Position.create(token.nextToken.pos.line, token.nextToken.pos.col)
      ),
      "".padEnd(expectedSpaces, " ")
    ),
  ];
};

const formatDtcNode = async (
  documentFormattingParams: DocumentFormattingParams,
  node: DtcBaseNode,
  uri: string,
  level: number,
  indentString: string,
  computeLevel: (astNode: ASTBase) => Promise<number>
): Promise<TextEdit[]> => {
  if (node.uri !== uri) return [];

  const result: TextEdit[] = [];

  const editToMoveToNewLine = pushItemToNewLine(
    node.firstToken,
    level,
    indentString
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(node.firstToken, level, indentString));
    const edit = removeNewLinesBetweenTokenAndPrev(node.firstToken);
    if (edit) result.push(edit);
  }

  if (node instanceof DtcChildNode || node instanceof DtcRefNode) {
    result.push(
      ...node.labels.flatMap((label) =>
        fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
      )
    );

    if (node instanceof DtcChildNode) {
      const nodeNameAndOpenCurlySpacing =
        node.name && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(node.name.lastToken)
          : [];
      result.push(...nodeNameAndOpenCurlySpacing);
    } else {
      const nodeNameAndOpenCurlySpacing =
        node.labelReference && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(
              node.labelReference.lastToken
            )
          : [];
      result.push(...nodeNameAndOpenCurlySpacing);
    }
  }

  result.push(
    ...(
      await Promise.all(
        node.children.flatMap((c) =>
          getTextEdit(documentFormattingParams, c, uri, computeLevel, level + 1)
        )
      )
    ).flat()
  );

  if (node.closeScope) {
    const editToMoveToNewLine = pushItemToNewLine(
      node.closeScope,
      level,
      indentString
    );

    if (editToMoveToNewLine) {
      result.push(editToMoveToNewLine);
    } else {
      result.push(createIndentEdit(node.closeScope, level, indentString));
      const edit = removeNewLinesBetweenTokenAndPrev(node.closeScope);
      if (edit) result.push(edit);
    }
  }

  const endStatementSpacing =
    node.lastToken.value === ";" && node.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(node.lastToken.prevToken, 0)
      : [];

  result.push(...endStatementSpacing);

  return result;
};

const formatLabeledValue = <T extends ASTBase>(
  documentFormattingParams: DocumentFormattingParams,
  value: LabeledValue<T>,
  level: number,
  index: number,
  indentString: string
): TextEdit[] => {
  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;

  if (
    value.firstToken.prevToken &&
    value.firstToken.pos.line === value.firstToken.prevToken.pos.line
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.firstToken.prevToken,
        index === 0 ? 0 : 1
      )
    );
  } else if (
    value.firstToken.pos.line !== value.firstToken.prevToken?.pos.line
  ) {
    const edit = removeNewLinesBetweenTokenAndPrev(value.firstToken);
    if (edit) result.push(edit);
    result.push(createIndentEdit(value.firstToken, level + 1, indentString));
  }
  value.value;

  return result;
};

const formatValue = (
  documentFormattingParams: DocumentFormattingParams,
  value: AllValueType,
  level: number,
  indentString: string
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value instanceof ArrayValues || value instanceof ByteStringValue) {
    result.push(
      ...value.values.flatMap((v, i) =>
        formatLabeledValue(documentFormattingParams, v, level, i, indentString)
      )
    );
    const lastValue = value.values.at(-1);
    if (lastValue?.lastToken) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(lastValue.lastToken, 0)
      );
    }
  }
  return result;
};

const formatPropertyValue = (
  documentFormattingParams: DocumentFormattingParams,
  value: PropertyValue,
  level: number,
  indentString: string
): TextEdit[] => {
  const delta = documentFormattingParams.options.tabSize;

  const result: TextEdit[] = [];
  if (value.firstToken.prevToken?.value === ",") {
    if (value.firstToken.prevToken.pos.line === value.firstToken.pos.line) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(value.firstToken.prevToken, 1)
      );
    } else {
      const edit = removeNewLinesBetweenTokenAndPrev(value.firstToken);
      if (edit) result.push(edit);
      result.push(createIndentEdit(value.firstToken, level + 1, indentString));
    }
  }

  if (value.lastToken.nextToken?.value === ",") {
    result.push(...fixedNumberOfSpaceBetweenTokensAndNext(value.lastToken, 0));
  }

  result.push(
    ...formatValue(documentFormattingParams, value.value, level, indentString)
  );

  result.push(
    ...value.endLabels.flatMap((label) =>
      fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    )
  );
  return result;
};

const formatPropertyValues = (
  documentFormattingParams: DocumentFormattingParams,
  values: PropertyValues,
  level: number,
  indentString: string
): TextEdit[] => {
  return [
    ...values.labels.flatMap((label) =>
      fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    ),
    ...values.values.flatMap((value) =>
      value
        ? formatPropertyValue(
            documentFormattingParams,
            value,
            level,
            indentString
          )
        : []
    ),
  ];
};

const formatDtcProperty = (
  documentFormattingParams: DocumentFormattingParams,
  property: DtcProperty,
  uri: string,
  level: number,
  indentString: string
): TextEdit[] => {
  if (property.uri !== uri) return [];

  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const editToMoveToNewLine = pushItemToNewLine(
    property.firstToken,
    level,
    indentString
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(property.firstToken, level, indentString));
    const edit = removeNewLinesBetweenTokenAndPrev(property.firstToken);
    if (edit) result.push(edit);
  }

  result.push(
    ...property.labels.flatMap((label) =>
      fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    )
  );

  if (property.values) {
    if (property.propertyName) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          property.propertyName?.lastToken
        )
      );
      if (property.propertyName?.lastToken.nextToken?.value === "=") {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            property.propertyName?.lastToken.nextToken
          )
        );
      }
    }
    result.push(
      ...formatPropertyValues(
        documentFormattingParams,
        property.values,
        level,
        indentString
      )
    );
  }

  const endStatementSpacing =
    property.lastToken.value === ";" && property.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(property.lastToken.prevToken, 0)
      : [];

  result.push(...endStatementSpacing);

  return result;
};

const formatDtcDelete = (
  documentFormattingParams: DocumentFormattingParams,
  deleteItem: DeleteBase,
  uri: string,
  level: number,
  indentString: string
): TextEdit[] => {
  if (deleteItem.uri !== uri) return [];

  const result: TextEdit[] = [];

  const editToMoveToNewLine = pushItemToNewLine(
    deleteItem.firstToken,
    level,
    indentString
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(deleteItem.firstToken, level, indentString));
  }

  const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
    deleteItem.keyword.lastToken
  );
  result.push(...keywordAndItemSpacing);

  const endStatementSpacing =
    deleteItem.lastToken.value === ";" && deleteItem.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(
          deleteItem.lastToken.prevToken,
          0
        )
      : [];

  result.push(...endStatementSpacing);

  return result;
};

const formatDtcInclude = (
  includeItem: Include,
  uri: string,
  level: number,
  indentString: string
): TextEdit[] => {
  if (includeItem.uri !== uri) return [];

  const result: TextEdit[] = [];

  const editToMoveToNewLine = pushItemToNewLine(
    includeItem.firstToken,
    level,
    indentString
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(includeItem.firstToken, level, indentString));
  }

  const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
    includeItem.keyword.lastToken
  );
  result.push(...keywordAndItemSpacing);

  return result;
};

const getTextEdit = async (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  uri: string,
  computeLevel: (astNode: ASTBase) => Promise<number>,
  level = 0
): Promise<TextEdit[]> => {
  const delta = documentFormattingParams.options.tabSize;
  const insertSpaces = documentFormattingParams.options.insertSpaces;
  const singleIndent = insertSpaces ? "".padStart(delta, " ") : "\t";

  if (astNode instanceof DtcBaseNode) {
    return formatDtcNode(
      documentFormattingParams,
      astNode,
      uri,
      level,
      singleIndent,
      computeLevel
    );
  } else if (astNode instanceof DtcProperty) {
    return formatDtcProperty(
      documentFormattingParams,
      astNode,
      uri,
      level,
      singleIndent
    );
  } else if (astNode instanceof DeleteBase) {
    return formatDtcDelete(
      documentFormattingParams,
      astNode,
      uri,
      level,
      singleIndent
    );
  } else if (astNode instanceof Include) {
    return formatDtcInclude(
      astNode,
      uri,
      await computeLevel(astNode),
      singleIndent
    );
  }

  return [];
};
