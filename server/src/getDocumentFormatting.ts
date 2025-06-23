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
import {
  DtcBaseNode,
  DtcChildNode,
  DtcRefNode,
  DtcRootNode,
} from "./ast/dtc/node";
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
  isPathEqual,
  positionInBetween,
  rangesOverlap,
  setIndentString,
} from "./helpers";
import { Comment, CommentBlock } from "./ast/dtc/comment";
import { LabelAssign } from "./ast/dtc/label";
import { ComplexExpression, Expression } from "./ast/cPreprocessors/expression";
import { CMacroCall } from "./ast/cPreprocessors/functionCall";
import { TextDocument } from "vscode-languageserver-textdocument";

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
  if (node instanceof DtcRootNode) return count + 1;

  if (!node || !isPathEqual(node.uri, uri)) return count;

  const closeAst = getClosestAstNode(node.parentNode);
  return countParent(uri, closeAst, count + 1);
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

    const closeAst = getClosestAstNode(parentAst);
    const count = countParent(uri, closeAst);
    return count;
  };

export async function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware,
  documentText: TextDocument
): Promise<TextEdit[]> {
  const splitDocument = documentText.getText().split("\n");
  const result: TextEdit[] = [];
  const uri = fileURLToPath(documentFormattingParams.textDocument.uri);

  const fileRootAsts = (await contextAware.getRuntime()).fileTopMostAsts(uri);

  result.push(
    ...(
      await Promise.all(
        fileRootAsts.flatMap(
          async (base) =>
            await getTextEdit(
              documentFormattingParams,
              base,
              uri,
              getAstItemLevel(fileRootAsts, uri),
              splitDocument
            )
        )
      )
    ).flat()
  );

  if (documentFormattingParams.options.trimTrailingWhitespace) {
    result.push(...removeTrailingWhitespace(splitDocument, result));
  }

  return result;
}

const removeTrailingWhitespace = (
  documentText: string[],
  textEdits: TextEdit[]
): TextEdit[] => {
  const result: TextEdit[] = [];
  documentText.forEach((line, i) => {
    const endTimmed = line.trimEnd();
    if (endTimmed.length !== line.length) {
      const rangeToCover = Range.create(
        Position.create(i, endTimmed.length),
        Position.create(i, line.length)
      );
      if (!textEdits.some((edit) => rangesOverlap(rangeToCover, edit.range)))
        result.push(TextEdit.del(rangeToCover));
    }
  });
  return result;
};

const removeNewLinesBetweenTokenAndPrev = (
  token: Token,
  documentText: string[],
  expectedNewLines = 1,
  forceExpectedNewLines = false
): TextEdit | undefined => {
  if (token.prevToken) {
    const diffNumberOfLines = token.pos.line - token.prevToken.pos.line;
    const linesToRemove = diffNumberOfLines - expectedNewLines;

    if (
      linesToRemove &&
      ((diffNumberOfLines !== 2 && expectedNewLines !== 0) ||
        expectedNewLines === 0 ||
        forceExpectedNewLines)
    ) {
      return TextEdit.replace(
        Range.create(
          Position.create(token.prevToken.pos.line, token.prevToken.pos.colEnd),
          Position.create(
            token.pos.line - expectedNewLines,
            expectedNewLines
              ? documentText[token.pos.line - expectedNewLines].length
              : token.pos.col
          )
        ),
        "".padEnd(expectedNewLines - 1, "\n")
      );
    }
  } else if (token.pos.line) {
    return TextEdit.del(
      Range.create(
        Position.create(0, 0),
        Position.create(token.pos.line, token.pos.col)
      )
    );
  }
};

const pushItemToNewLineAndIndent = (
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
  documentText: string[],
  prefix: string = ""
): TextEdit[] => {
  const indent = `${"".padStart(
    level * indentString.length,
    indentString
  )}${prefix}`;
  const range = Range.create(
    Position.create(token.pos.line, 0),
    Position.create(token.pos.line, token.pos.col)
  );
  const currentText = getTextFromRange(documentText, range);
  if (indent === currentText) return [];

  return [
    TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, 0),
        Position.create(token.pos.line, token.pos.col)
      ),
      indent
    ),
  ];
};

const fixedNumberOfSpaceBetweenTokensAndNext = (
  token: Token,
  documentText: string[],
  expectedSpaces = 1,
  keepNewLines = false
): TextEdit[] => {
  if (!token.nextToken) return [];

  if (token.nextToken?.pos.line !== token.pos.line) {
    if (keepNewLines) {
      return []; // todo remove white space
    }
    const removeNewLinesEdit = removeNewLinesBetweenTokenAndPrev(
      token.nextToken,
      documentText,
      0
    );
    if (!removeNewLinesEdit) {
      throw new Error("remove new LinesEdit must be defined");
    }
    if (expectedSpaces) {
      removeNewLinesEdit.newText = `${"".padEnd(expectedSpaces, " ")}${
        removeNewLinesEdit.newText
      }`;
    }
    return [removeNewLinesEdit];
  }

  const numberOfWhiteSpace = token.nextToken.pos.col - token.pos.colEnd;

  if (numberOfWhiteSpace === expectedSpaces) return [];

  if (expectedSpaces === 0) {
    return [
      TextEdit.del(
        Range.create(
          Position.create(token.pos.line, token.pos.colEnd),
          Position.create(token.nextToken.pos.line, token.nextToken.pos.col)
        )
      ),
    ];
  }

  return [
    TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.colEnd),
        Position.create(token.nextToken.pos.line, token.nextToken.pos.col)
      ),
      "".padEnd(expectedSpaces, " ")
    ),
  ];
};

const formatLabels = (labels: LabelAssign[], documentText: string[]) => {
  return labels
    .slice(1)
    .flatMap((label) =>
      label.firstToken.prevToken
        ? fixedNumberOfSpaceBetweenTokensAndNext(
            label.firstToken.prevToken,
            documentText
          )
        : []
    );
};

const formatDtcNode = async (
  documentFormattingParams: DocumentFormattingParams,
  node: DtcBaseNode,
  uri: string,
  level: number,
  indentString: string,
  documentText: string[],
  computeLevel: (astNode: ASTBase) => Promise<number | undefined>
): Promise<TextEdit[]> => {
  if (!isPathEqual(node.uri, uri)) return []; // node may have been included!!

  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      node.firstToken,
      level,
      indentString,
      documentText
    )
  );

  if (node instanceof DtcChildNode || node instanceof DtcRefNode) {
    result.push(...formatLabels(node.labels, documentText));

    if (node instanceof DtcChildNode) {
      if (node.labels.length && node.name && node.name.firstToken.prevToken) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            node.name.firstToken.prevToken,
            documentText
          )
        );
      }
      const nodeNameAndOpenCurlySpacing =
        node.name && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(
              node.name.lastToken,
              documentText
            )
          : [];
      result.push(...nodeNameAndOpenCurlySpacing);
    } else {
      if (node.labels.length && node.labelReference?.firstToken.prevToken) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            node.labelReference.firstToken.prevToken,
            documentText
          )
        );
      }
      const nodeNameAndOpenCurlySpacing =
        node.labelReference && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(
              node.labelReference.lastToken,
              documentText
            )
          : [];
      result.push(...nodeNameAndOpenCurlySpacing);
    }
  } else if (
    node instanceof DtcRootNode &&
    node.firstToken.value === "/" &&
    node.openScope
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        node.firstToken,
        documentText,
        1
      )
    );
  }

  result.push(
    ...(
      await Promise.all(
        node.children.flatMap((c) =>
          getTextEdit(
            documentFormattingParams,
            c,
            uri,
            computeLevel,
            documentText,
            level + 1
          )
        )
      )
    ).flat()
  );

  if (node.closeScope) {
    result.push(
      ...ensureOnNewLineAndMax1EmptyLineToPrev(
        node.closeScope,
        level,
        indentString,
        documentText,
        undefined,
        1,
        true
      )
    );
  }

  if (node.lastToken.value === ";" && node.closeScope) {
    result.push(...moveNextTo(node.closeScope, node.lastToken));
  }

  return result;
};

const formatLabeledValue = <T extends ASTBase>(
  value: LabeledValue<T>,
  level: number,
  indentString: string,
  openBracket: Token | undefined,
  prevValue: LabeledValue<T> | undefined,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(...formatLabels(value.labels, documentText));

  if (value.labels.length && value.value?.firstToken.prevToken) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.value.firstToken.prevToken,
        documentText
      )
    );
  }

  if (openBracket && value.firstToken.prevToken === openBracket) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(openBracket, documentText, 0)
    );
  } else {
    if (value.firstToken.pos.line !== value.firstToken.prevToken?.pos.line) {
      const edit = removeNewLinesBetweenTokenAndPrev(
        value.firstToken,
        documentText,
        1,
        true
      );
      if (edit) result.push(edit);
      result.push(
        ...createIndentEdit(
          value.firstToken,
          level + 2,
          indentString,
          documentText
        )
      );
    } else {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          value.firstToken.prevToken,
          documentText,
          1
        )
      );
    }
  }

  if (value.value instanceof Expression) {
    result.push(...formatExpression(value.value, documentText));
  }

  return result;
};

const formatValue = (
  value: AllValueType,
  level: number,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value instanceof ArrayValues || value instanceof ByteStringValue) {
    result.push(
      ...value.values.flatMap((v, i) =>
        formatLabeledValue(
          v,
          level,
          indentString,
          value.openBracket,
          i ? value.values.at(i - 1) : undefined,
          documentText
        )
      )
    );

    if (value.closeBracket?.prevToken) {
      if (value.closeBracket.prevToken === value.values.at(-1)?.lastToken) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            value.closeBracket.prevToken,
            documentText,
            0
          )
        );
      } else {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            value.closeBracket.prevToken,
            documentText,
            1
          )
        );
      }
    }
  } else if (value instanceof Expression) {
    result.push(...formatExpression(value, documentText));
  }

  return result;
};

const formatExpression = (
  value: Expression,
  documentText: string[]
): TextEdit[] => {
  if (value instanceof CMacroCall) {
    return formatCMacroCall(value, documentText);
  }

  if (value instanceof ComplexExpression) {
    return formatComplexExpression(value, documentText);
  }

  return [];
};

const formatCMacroCall = (
  value: CMacroCall,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(
    ...fixedNumberOfSpaceBetweenTokensAndNext(
      value.functionName.lastToken,
      documentText,
      0
    )
  );

  value.params.forEach((param, i) => {
    if (param?.firstToken.prevToken) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          param?.firstToken.prevToken,
          documentText,
          i ? 1 : 0
        )
      );
    }
    if (param?.splitToken) {
      result.push(...moveNextTo(param.lastToken, param.splitToken));
    }
  });

  if (value.lastToken.value === ")" && value.lastToken.prevToken) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.lastToken.prevToken,
        documentText,
        0
      )
    );
  }

  return result;
};

const formatComplexExpression = (
  value: ComplexExpression,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value.openBracket && value.openBracket.nextToken) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.openBracket,
        documentText,
        0
      )
    );
  }

  result.push(...formatExpression(value.expression, documentText));

  if (value.join) {
    if (value.join.operator.firstToken.prevToken) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          value.join.operator.firstToken.prevToken,
          documentText
        )
      );
    }
    if (value.join.expression.firstToken.prevToken) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          value.join.expression.firstToken.prevToken,
          documentText
        )
      );
    }
    result.push(...formatExpression(value.join.expression, documentText));
  }

  if (value.closeBracket && value.closeBracket.prevToken) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        value.closeBracket.prevToken,
        documentText,
        0
      )
    );
  }

  return result;
};

const formatPropertyValue = (
  value: PropertyValue,
  level: number,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(...formatLabels(value.startLabels, documentText));

  result.push(...formatValue(value.value, level, indentString, documentText));

  result.push(...formatLabels(value.endLabels, documentText));

  return result;
};

const formatPropertyValues = (
  values: PropertyValues,
  level: number,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  values.values.forEach((value) => {
    if (!value) return [];

    // ensure sameline or newline between  `< 10...` and what is before it
    if (value.firstToken.prevToken) {
      if (value.firstToken.prevToken.pos.line === value.firstToken.pos.line) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            value.firstToken.prevToken,
            documentText,
            1
          )
        );
      } else {
        const edit = removeNewLinesBetweenTokenAndPrev(
          value.firstToken,
          documentText,
          1,
          true
        );
        if (edit) result.push(edit);
        result.push(
          ...createIndentEdit(
            value.firstToken,
            level + 2,
            indentString,
            documentText
          )
        );
      }
    }

    result.push(
      ...formatPropertyValue(value, level, indentString, documentText)
    );

    if (value.nextValueSeparator) {
      result.push(...moveNextTo(value.lastToken, value.nextValueSeparator));
    }
  });

  return result;
};

const formatDtcProperty = (
  property: DtcProperty,
  level: number,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      property.firstToken,
      level,
      indentString,
      documentText
    )
  );

  result.push(...formatLabels(property.labels, documentText));

  if (property.labels.length && property.propertyName?.firstToken.prevToken) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        property.propertyName.firstToken.prevToken,
        documentText
      )
    );
  }

  if (property.values) {
    if (property.propertyName) {
      // space before =
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          property.propertyName?.lastToken,
          documentText
        )
      );
    }
    result.push(
      ...formatPropertyValues(
        property.values,
        level,
        indentString,
        documentText
      )
    );
  }

  if (property.lastToken.value === ";") {
    result.push(
      ...moveNextTo(property.children.at(-1)!.lastToken, property.lastToken)
    );
  }

  return result;
};

const ensureOnNewLineAndMax1EmptyLineToPrev = (
  token: Token,
  level: number,
  indentString: string,
  documentText: string[],
  prefix?: string,
  expectedNewLines?: number,
  forceExpectedNewLines?: boolean
) => {
  const result: TextEdit[] = [];

  const editToMoveToNewLine = pushItemToNewLineAndIndent(
    token,
    level,
    indentString,
    prefix
  );

  if (editToMoveToNewLine) {
    result.push(editToMoveToNewLine);
  } else {
    const edit = removeNewLinesBetweenTokenAndPrev(
      token,
      documentText,
      expectedNewLines,
      forceExpectedNewLines
    );
    if (edit) result.push(edit);
    result.push(
      ...createIndentEdit(token, level, indentString, documentText, prefix)
    );
  }

  return result;
};

const moveNextTo = (token: Token, toMove: Token) => {
  if (
    token.pos.line === toMove.pos.line &&
    token.pos.colEnd + 1 === toMove.pos.colEnd
  ) {
    return [];
  }

  if (token.nextToken === toMove) {
    return [
      TextEdit.replace(
        Range.create(
          Position.create(token.pos.line, token.pos.colEnd),
          Position.create(toMove.pos.line, toMove.pos.colEnd)
        ),
        toMove.value
      ),
    ];
  }

  return [
    TextEdit.insert(
      Position.create(token.pos.line, token.pos.colEnd),
      toMove.value
    ),
    TextEdit.del(
      Range.create(
        Position.create(
          toMove.prevToken?.pos.line ?? toMove.pos.line,
          toMove.prevToken?.pos.colEnd ?? toMove.pos.col
        ),
        Position.create(toMove.pos.line, toMove.pos.colEnd)
      )
    ),
  ];
};

const formatDtcDelete = (
  deleteItem: DeleteBase,
  level: number,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      deleteItem.firstToken,
      level,
      indentString,
      documentText
    )
  );

  const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
    deleteItem.keyword.lastToken,
    documentText
  );
  result.push(...keywordAndItemSpacing);

  if (deleteItem.lastToken.value === ";") {
    result.push(
      ...moveNextTo(deleteItem.children.at(-1)!.lastToken, deleteItem.lastToken)
    );
  }

  return result;
};

const formatDtcInclude = (
  includeItem: Include,
  uri: string,
  level: number | undefined,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  // we should not format this case
  if (level === undefined) return [];

  if (!isPathEqual(includeItem.uri, uri)) return []; // may be coming from some other include  hence ignore

  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      includeItem.firstToken,
      level,
      indentString,
      documentText
    )
  );

  const keywordAndItemSpacing = fixedNumberOfSpaceBetweenTokensAndNext(
    includeItem.keyword.lastToken,
    documentText
  );
  result.push(...keywordAndItemSpacing);

  return result;
};

const formatCommentBlock = (
  commentItem: CommentBlock,
  level: number | undefined,
  indentString: string,
  documentText: string[]
): TextEdit[] =>
  commentItem.comments.flatMap((c, i) =>
    formatBlockCommentLine(
      c,
      level,
      indentString,
      documentText,
      i ? (i === commentItem.comments.length - 1 ? "last" : "comment") : "first"
    )
  );

const formatBlockCommentLine = (
  commentItem: Comment,
  level: number | undefined,
  indentString: string,
  documentText: string[],
  lineType: "last" | "first" | "comment"
): TextEdit[] => {
  const result: TextEdit[] = [];

  // we should not format further. This case as it is not between node or properties or in root
  // e.g. prop = <10 /* abc */ 10>;
  const commentLine = commentItem.firstToken.pos.line;
  if (
    commentItem.firstToken.prevToken &&
    (level === undefined ||
      commentLine === commentItem.firstToken.prevToken?.pos.line) // e.g. prop = <10 /* abc */ 10>; or  prop = <10 10>;  /* abc */
  ) {
    return fixedNumberOfSpaceBetweenTokensAndNext(
      commentItem.firstToken.prevToken,
      documentText
    );
  }

  let prifix: string | undefined;
  switch (lineType) {
    case "comment":
      prifix = commentItem.firstToken.value === "*" ? " " : " * ";
      break;
    case "first":
      break;
    case "last":
      prifix = " ";
      break;
  }

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      commentItem.firstToken,
      level ?? 0,
      indentString,
      documentText,
      prifix
    )
  );

  return result;
};

const formatComment = (
  commentItem: Comment,
  level: number | undefined,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  const commentLine = commentItem.firstToken.pos.line;
  if (
    commentLine === commentItem.firstToken.prevToken?.pos.line // e.g prop = 10; // foo
  ) {
    return fixedNumberOfSpaceBetweenTokensAndNext(
      commentItem.firstToken.prevToken,
      documentText
    );
  }

  return ensureOnNewLineAndMax1EmptyLineToPrev(
    commentItem.firstToken,
    level ?? 0,
    indentString,
    documentText
  );
};

const getTextEdit = async (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  uri: string,
  computeLevel: (astNode: ASTBase) => Promise<number | undefined>,
  documentText: string[],
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
      documentText,
      computeLevel
    );
  } else if (astNode instanceof DtcProperty) {
    return formatDtcProperty(astNode, level, singleIndent, documentText);
  } else if (astNode instanceof DeleteBase) {
    return formatDtcDelete(astNode, level, singleIndent, documentText);
  } else if (astNode instanceof Include) {
    return formatDtcInclude(
      astNode,
      uri,
      await computeLevel(astNode),
      singleIndent,
      documentText
    );
  } else if (astNode instanceof Comment) {
    return formatComment(
      astNode,
      await computeLevel(astNode),
      singleIndent,
      documentText
    );
  } else if (astNode instanceof CommentBlock) {
    return formatCommentBlock(
      astNode,
      await computeLevel(astNode),
      singleIndent,
      documentText
    );
  }

  return [];
};

function getTextFromRange(lines: string[], range: Range): string {
  const startLine = lines[range.start.line];
  const endLine = lines[range.end.line];

  if (range.start.line === range.end.line) {
    // Single-line range
    return startLine.substring(range.start.character, range.end.character);
  }

  // Multi-line range
  const middleLines = lines.slice(range.start.line + 1, range.end.line);
  return [
    startLine.substring(range.start.character),
    ...middleLines,
    endLine.substring(0, range.end.character),
  ].join("\n");
}
