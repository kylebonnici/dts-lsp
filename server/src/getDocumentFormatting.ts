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

export async function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware
): Promise<TextEdit[]> {
  const uri = documentFormattingParams.textDocument.uri.replace("file://", "");
  const parser = (await contextAware.getAllParsers()).find(
    (p) => p.uri === uri
  );

  return parser
    ? parser.allAstItems.flatMap((base) =>
        getTextEdit(documentFormattingParams, base, uri)
      )
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
  documentFormattingParams: DocumentFormattingParams,
  token: Token,
  level: number
): TextEdit | undefined => {
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const newLine = token.pos.line === token.prevToken?.pos.line;

  if (newLine) {
    return TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.col),
        Position.create(token.pos.line, token.pos.col)
      ),
      `\n${"".padStart(expectedIndent, " ")}`
    );
  }
};

const createIndentEdit = (token: Token, expectedIndent: number): TextEdit => {
  return TextEdit.replace(
    Range.create(
      Position.create(token.pos.line, 0),
      Position.create(token.pos.line, token.pos.col)
    ),
    "".padStart(expectedIndent, " ")
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

const formatDtcNode = (
  documentFormattingParams: DocumentFormattingParams,
  node: DtcBaseNode,
  uri: string,
  level: number
): TextEdit[] => {
  if (node.uri !== uri) return [];

  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const editToMoveToNewLine = pushItemToNewLine(
    documentFormattingParams,
    node.firstToken,
    level
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(node.firstToken, expectedIndent));
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
    ...node.children.flatMap((c) =>
      getTextEdit(documentFormattingParams, c, uri, level + 1)
    )
  );

  if (node.closeScope) {
    const editToMoveToNewLine = pushItemToNewLine(
      documentFormattingParams,
      node.closeScope,
      level
    );

    if (editToMoveToNewLine) {
      result.push(editToMoveToNewLine);
    } else {
      result.push(createIndentEdit(node.closeScope, expectedIndent));
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
  index: number
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
    result.push(createIndentEdit(value.firstToken, (level + 1) * delta));
  }
  value.value;

  return result;
};

const formatValue = (
  documentFormattingParams: DocumentFormattingParams,
  value: AllValueType,
  level: number
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value instanceof ArrayValues || value instanceof ByteStringValue) {
    result.push(
      ...value.values.flatMap((v, i) =>
        formatLabeledValue(documentFormattingParams, v, level, i)
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
  level: number
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
      result.push(createIndentEdit(value.firstToken, (level + 1) * delta));
    }
  }

  if (value.lastToken.nextToken?.value === ",") {
    result.push(...fixedNumberOfSpaceBetweenTokensAndNext(value.lastToken, 0));
  }

  result.push(...formatValue(documentFormattingParams, value.value, level));

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
  level: number
): TextEdit[] => {
  return [
    ...values.labels.flatMap((label) =>
      fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    ),
    ...values.values.flatMap((value) =>
      value ? formatPropertyValue(documentFormattingParams, value, level) : []
    ),
  ];
};

const formatDtcProperty = (
  documentFormattingParams: DocumentFormattingParams,
  property: DtcProperty,
  uri: string,
  level: number
): TextEdit[] => {
  if (property.uri !== uri) return [];

  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const editToMoveToNewLine = pushItemToNewLine(
    documentFormattingParams,
    property.firstToken,
    level
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(property.firstToken, expectedIndent));
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
      ...formatPropertyValues(documentFormattingParams, property.values, level)
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
  level: number
): TextEdit[] => {
  if (deleteItem.uri !== uri) return [];

  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const editToMoveToNewLine = pushItemToNewLine(
    documentFormattingParams,
    deleteItem.firstToken,
    level
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(deleteItem.firstToken, expectedIndent));
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
  documentFormattingParams: DocumentFormattingParams,
  includeItem: Include,
  uri: string,
  level: number
): TextEdit[] => {
  if (includeItem.uri !== uri) return [];

  const result: TextEdit[] = [];
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  const editToMoveToNewLine = pushItemToNewLine(
    documentFormattingParams,
    includeItem.firstToken,
    level
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(createIndentEdit(includeItem.firstToken, expectedIndent));
  }

  const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
    includeItem.keyword.lastToken
  );
  result.push(...keywordAndItemSpacing);

  return result;
};

const getTextEdit = (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  uri: string,
  level = 0
): TextEdit[] => {
  if (astNode instanceof DtcBaseNode) {
    return formatDtcNode(documentFormattingParams, astNode, uri, level);
  } else if (astNode instanceof DtcProperty) {
    return formatDtcProperty(documentFormattingParams, astNode, uri, level);
  } else if (astNode instanceof DeleteBase) {
    return formatDtcDelete(documentFormattingParams, astNode, uri, level);
  }

  // TODO Format includes and comments
  // } else if (astNode instanceof Include) {
  //   const countLevel = (token: Token, level = 0): number => {
  //     if (!token.prevToken) {
  //       return level;
  //     }
  //     return countLevel(
  //       token.prevToken,
  //       token.prevToken.value === "{" ? level + 1 : level
  //     );
  //   };
  //   return formatDtcInclude(
  //     documentFormattingParams,
  //     astNode,
  //     uri,
  //     countLevel(astNode.firstToken)
  //   );
  // }

  return [];
};
