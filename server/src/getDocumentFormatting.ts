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
import {
  fileURLToPath,
  getDeepestAstNodeInBetween,
  positionInBetween,
  setIndentString,
} from "./helpers";
import { Comment } from "./ast/dtc/comment";

const findAst = async (token: Token, uri: string, fileRootAsts: ASTBase[]) => {
  const pos = Position.create(token.pos.line, token.pos.col);
  const parent = fileRootAsts.find((ast) => positionInBetween(ast, uri, pos));

  if (!parent) return;

  return getDeepestAstNodeInBetween(parent, uri, pos);
};

const getClosestAstNode = (ast?: ASTBase): DtcBaseNode | undefined => {
  if (!ast) {
    return;
  }
  return ast instanceof DtcBaseNode ? ast : getClosestAstNode(ast?.parentNode);
};

export const countParent = (
  uri: string,
  node?: DtcBaseNode,
  count = 0
): number => {
  if (!node || node.uri !== uri) return count;

  return countParent(uri, getClosestAstNode(node.parentNode), count + 1);
};

const getAstItemLevel =
  (fileRootAsts: ASTBase[], uri: string) => async (astNode: ASTBase) => {
    const parentAst = await findAst(astNode.firstToken, uri, fileRootAsts);

    if (
      !parentAst ||
      parentAst === astNode ||
      astNode.allDescendants.some((a) => a === parentAst)
    ) {
      return 0;
    }

    if (!(parentAst instanceof DtcBaseNode)) {
      return;
    }

    const count = countParent(uri, getClosestAstNode(parentAst));
    return count;
  };

export async function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware
): Promise<TextEdit[]> {
  const result: TextEdit[] = [];
  const uri = fileURLToPath(documentFormattingParams.textDocument.uri);

  const fileRootAsts = (await contextAware.getRuntime()).fileTopMostAst(uri);

  result.push(
    ...(
      await Promise.all(
        fileRootAsts.flatMap(
          async (base) =>
            await getTextEdit(
              documentFormattingParams,
              base,
              uri,
              getAstItemLevel(fileRootAsts, uri)
            )
        )
      )
    ).flat()
  );

  return result;
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
  indentString: string,
  prefix: string = ""
): TextEdit | undefined => {
  const newLine = token.pos.line === token.prevToken?.pos.line;

  if (newLine) {
    return TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.col),
        Position.create(token.pos.line, token.pos.col)
      ),
      `\n${prefix}${"".padStart(level * indentString.length, indentString)}`
    );
  }
};

const createIndentEdit = (
  token: Token,
  level: number,
  indentString: string,
  prefix: string = ""
): TextEdit => {
  return TextEdit.replace(
    Range.create(
      Position.create(token.pos.line, 0),
      Position.create(token.pos.line, token.pos.col)
    ),
    `${"".padStart(level * indentString.length, indentString)}${prefix}`
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
  computeLevel: (astNode: ASTBase) => Promise<number | undefined>
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
  value: LabeledValue<T>,
  level: number,
  indentString: string,
  last: boolean
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(
    ...fixedNumberOfSpaceBetweenTokensAndNext(value.lastToken, last ? 0 : 1)
  );

  if (value.firstToken.pos.line !== value.firstToken.prevToken?.pos.line) {
    const edit = removeNewLinesBetweenTokenAndPrev(value.firstToken);
    if (edit) result.push(edit);
    result.push(createIndentEdit(value.firstToken, level + 1, indentString));
  }
  value.value;

  return result;
};

const formatValue = (
  value: AllValueType,
  level: number,
  indentString: string,
  formatEnd: boolean
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value instanceof ArrayValues || value instanceof ByteStringValue) {
    if (value.openBracket) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(value.openBracket, 0)
      );
    }

    result.push(
      ...value.values.flatMap((v, i) =>
        formatLabeledValue(
          v,
          level,
          indentString,
          i + 1 === value.values.length &&
            value.lastToken.nextToken === value.closeBracket
        )
      )
    );

    if (value.closeBracket && value.closeBracket?.nextToken?.value !== ";") {
      if (value.openBracket) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(value.closeBracket, 0)
        );
      }
    }
  } else if (value?.lastToken && formatEnd) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.lastToken,
        value?.lastToken.nextToken?.value === "," ? 0 : 1
      )
    );
  }

  return result;
};

const formatPropertyValue = (
  value: PropertyValue,
  level: number,
  indentString: string,
  last: boolean
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(
    ...value.startLabels.flatMap((label, i) =>
      i + 1 === value.startLabels.length
        ? []
        : fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    )
  );

  result.push(
    ...formatValue(
      value.value,
      level,
      indentString,
      !last || value.endLabels.length > 0
    )
  );

  // we leve this up to the semicolon if it is there to format this case

  result.push(
    ...value.endLabels.flatMap((label, i) =>
      i + 1 === value.endLabels.length
        ? []
        : fixedNumberOfSpaceBetweenTokensAndNext(label.lastToken)
    )
  );

  return result;
};

const formatPropertyValues = (
  values: PropertyValues,
  level: number,
  indentString: string
): TextEdit[] => {
  const result: TextEdit[] = [];

  const getCommaToken = (t?: Token): Token | undefined => {
    if (!t) return;
    if (
      !positionInBetween(
        values,
        values.uri,
        Position.create(t.pos.line, t.pos.col)
      )
    )
      return;
    return t.value === "," ? t : getCommaToken(t.nextToken);
  };

  values.values.forEach((value, i) => {
    if (!value) return [];
    const commaToken = getCommaToken(value.lastToken);
    const nextValue = values.values.at(i + 1);
    if (commaToken) {
      if (commaToken.pos.line === nextValue?.firstToken?.pos.line) {
        result.push(...fixedNumberOfSpaceBetweenTokensAndNext(commaToken, 1));
      } else if (nextValue?.firstToken) {
        const edit = removeNewLinesBetweenTokenAndPrev(nextValue?.firstToken);
        if (edit) result.push(edit);
        result.push(
          createIndentEdit(nextValue?.firstToken, level + 1, indentString)
        );
      }
    }
  });

  return [
    ...result,
    ...values.values.flatMap((value, i) =>
      value
        ? formatPropertyValue(
            value,
            level,
            indentString,
            i + 1 === values.values.length
          )
        : []
    ),
  ];
};

const formatDtcProperty = (
  property: DtcProperty,
  level: number,
  indentString: string
): TextEdit[] => {
  const result: TextEdit[] = [];

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
      const getEqualToken = (t?: Token): Token | undefined =>
        t ? (t.value === "=" ? t : getEqualToken(t.nextToken)) : undefined;

      const equalToken = getEqualToken(
        property.propertyName?.lastToken.nextToken
      );
      if (equalToken) {
        result.push(...fixedNumberOfSpaceBetweenTokensAndNext(equalToken));
      }
    }
    result.push(...formatPropertyValues(property.values, level, indentString));
  }

  const endStatementSpacing =
    property.lastToken.value === ";" && property.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(property.lastToken.prevToken, 0)
      : [];

  result.push(...endStatementSpacing);

  return result;
};

const formatDtcDelete = (
  deleteItem: DeleteBase,
  level: number,
  indentString: string
): TextEdit[] => {
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
  level: number | undefined,
  indentString: string
): TextEdit[] => {
  // we should not format this case
  if (level === undefined) return [];

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

const formatComment = (
  commentItem: Comment,
  level: number | undefined,
  indentString: string
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (
    commentItem.lastToken.pos.line ===
      commentItem.lastToken.nextToken?.pos.line &&
    commentItem.lastToken.nextToken.value !== ";"
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(commentItem.lastToken)
    );
  }

  // if comment in on same line as some othher elemet and comment fits on one line keep where it is just fix spaces
  if (
    level !== undefined &&
    commentItem.firstToken.pos.line ===
      commentItem.firstToken.prevToken?.pos.line &&
    commentItem.firstToken.pos.line === commentItem.lastToken.pos.line
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        commentItem.firstToken.prevToken
      )
    );
    return result;
  }

  // we should not format further. This case as it is not between node or properties or in root
  // e.g. prop = <10 /* abc */ 10>;
  if (level === undefined) {
    return result;
  }

  const prefix = commentItem.firstToken.value.startsWith("*") ? " " : "";

  const editToMoveToNewLine = pushItemToNewLine(
    commentItem.firstToken,
    level,
    indentString,
    prefix
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    result.push(
      createIndentEdit(commentItem.firstToken, level, indentString, prefix)
    );
    const edit = removeNewLinesBetweenTokenAndPrev(commentItem.firstToken);
    if (edit) result.push(edit);
  }

  return result;
};

const getTextEdit = async (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  uri: string,
  computeLevel: (astNode: ASTBase) => Promise<number | undefined>,
  level = 0
): Promise<TextEdit[]> => {
  const delta = documentFormattingParams.options.tabSize;
  const insertSpaces = documentFormattingParams.options.insertSpaces;
  const singleIndent = insertSpaces ? "".padStart(delta, " ") : "\t";

  setIndentString(singleIndent);

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
    return formatDtcProperty(astNode, level, singleIndent);
  } else if (astNode instanceof DeleteBase) {
    return formatDtcDelete(astNode, level, singleIndent);
  } else if (astNode instanceof Include) {
    return formatDtcInclude(
      astNode,
      uri,
      await computeLevel(astNode),
      singleIndent
    );
  } else if (astNode instanceof Comment) {
    return formatComment(astNode, await computeLevel(astNode), singleIndent);
  }

  return [];
};
