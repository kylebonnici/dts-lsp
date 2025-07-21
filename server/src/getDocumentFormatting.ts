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
import { getPropertyFromChild, isPropertyValueChild } from "./ast/helpers";

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
  if (!node || !isPathEqual(node.uri, uri) || !node.parentNode?.uri)
    return count;

  const closeAst = getClosestAstNode(node.parentNode);
  return countParent(uri, closeAst, count + 1);
};

type LevelMeta = {
  level: number;
  inAst?: ASTBase;
};
const getAstItemLevel =
  (fileRootAsts: ASTBase[], uri: string) =>
  async (astNode: ASTBase): Promise<LevelMeta | undefined> => {
    const rootItem = fileRootAsts.filter(
      (ast) =>
        !(ast instanceof Include) &&
        !(ast instanceof Comment) &&
        !(ast instanceof CommentBlock)
    );
    const parentAst = await findAst(astNode.firstToken, uri, rootItem);

    if (
      !parentAst ||
      parentAst === astNode ||
      astNode.allDescendants.some((a) => a === parentAst)
    ) {
      return {
        level: 0,
      };
    }

    const closeAst = getClosestAstNode(parentAst);
    const level = countParent(uri, closeAst);
    return {
      level,
      inAst: parentAst,
    };
  };

export async function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware,
  documentText: string
): Promise<TextEdit[]> {
  const splitDocument = documentText.split("\n");
  const result: TextEdit[] = [];
  const uri = fileURLToPath(documentFormattingParams.textDocument.uri);

  const runtime = await contextAware.getRuntime();
  let fileRootAsts = runtime.fileTopMostAsts(uri);

  const fileIncludes = runtime.includes.filter((i) =>
    isPathEqual(i.resolvedPath, uri)
  );

  if (fileIncludes.length > 1) {
    const tmp: ASTBase[] = [];

    fileRootAsts.forEach((ast) => {
      if (
        tmp.some(
          (r) =>
            r.firstToken.pos.line === ast.firstToken.pos.line &&
            r.firstToken.pos.col === ast.firstToken.pos.col
        )
      ) {
        return;
      }
      tmp.push(ast);
    });

    fileRootAsts = tmp;
  }

  const astItemLevel = getAstItemLevel(fileRootAsts, uri);
  result.push(
    ...(
      await Promise.all(
        fileRootAsts.flatMap(
          async (base) =>
            await getTextEdit(
              documentFormattingParams,
              base,
              uri,
              astItemLevel,
              splitDocument
            )
        )
      )
    ).flat()
  );

  if (documentFormattingParams.options.trimTrailingWhitespace) {
    result.push(...removeTrailingWhitespace(splitDocument, result));
  }

  const formatOnOffMeta = pairFormatOnOff(fileRootAsts, splitDocument);
  return formatOnOffMeta.length
    ? result.filter(
        (edit) => !isFormattingDisabledAt(edit.range.start, formatOnOffMeta)
      )
    : result;
}
const pairFormatOnOff = (
  fileRootAsts: ASTBase[],
  documentLines: string[]
): Range[] => {
  const last = Position.create(
    documentLines.length - 1,
    documentLines.at(-1)?.length ?? 0
  );

  const formatControlRanges: Range[] = [];
  let pendingOff: { start: Position } | undefined;

  const controlComments = fileRootAsts
    .filter(
      (ast) =>
        (ast instanceof CommentBlock || ast instanceof Comment) &&
        /^dts-format (on|off)$/.test(ast.toString().trim())
    )

    .sort((a, b) => a.firstToken.pos.line - b.firstToken.pos.line);

  controlComments.forEach((ast) => {
    const value = ast.toString().trim();

    if (value === "dts-format off") {
      pendingOff = {
        start: Position.create(
          ast.firstToken.pos.line,
          ast instanceof CommentBlock ? ast.firstToken.pos.colEnd : 0
        ),
      };
    } else if (value === "dts-format on" && pendingOff) {
      const end = Position.create(
        ast.lastToken.pos.line,
        ast instanceof CommentBlock
          ? ast.lastToken.pos.colEnd - 1
          : documentLines[ast.lastToken.pos.line - 1].length
      );
      formatControlRanges.push(Range.create(pendingOff.start, end));
      pendingOff = undefined;
    }
  });

  // If still "off" with no "on", use last known AST node as document end
  if (pendingOff) {
    formatControlRanges.push(Range.create(pendingOff.start, last));
  }

  return formatControlRanges;
};

function comparePositions(a: Position, b: Position): number {
  if (a.line < b.line) return -1;
  if (a.line > b.line) return 1;
  if (a.character < b.character) return -1;
  if (a.character > b.character) return 1;
  return 0;
}

const isFormattingDisabledAt = (
  pos: Position,
  disabledRanges: Range[]
): boolean => {
  return disabledRanges.some(
    (range) =>
      comparePositions(pos, range.start) >= 0 &&
      comparePositions(pos, range.end) <= 0
  );
};

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
  forceExpectedNewLines = false,
  prevToken = token.prevToken
): TextEdit | undefined => {
  if (prevToken) {
    const diffNumberOfLines = token.pos.line - prevToken.pos.line;
    const linesToRemove = diffNumberOfLines - expectedNewLines;

    if (
      linesToRemove &&
      ((diffNumberOfLines !== 2 && expectedNewLines !== 0) ||
        expectedNewLines === 0 ||
        forceExpectedNewLines)
    ) {
      return TextEdit.replace(
        Range.create(
          Position.create(prevToken.pos.line, prevToken.pos.colEnd),
          Position.create(
            token.pos.line - expectedNewLines,
            expectedNewLines
              ? documentText[token.pos.line - expectedNewLines].length
              : token.pos.col
          )
        ),
        "".padEnd(expectedNewLines - (forceExpectedNewLines ? 1 : 0), "\n")
      );
    }
  } else if (token.pos.line) {
    return TextEdit.del(
      Range.create(Position.create(0, 0), Position.create(token.pos.line, 0))
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

  if (token.prevToken && newLine) {
    return TextEdit.replace(
      Range.create(
        Position.create(token.prevToken.pos.line, token.prevToken.pos.colEnd),
        Position.create(token.pos.line, token.pos.col)
      ),
      `\n${"".padStart(level * indentString.length, indentString)}${prefix}`
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
  keepNewLines = false,
  tab = false
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
      removeNewLinesEdit.newText = `${"".padEnd(
        expectedSpaces,
        tab ? "\t" : " "
      )}${removeNewLinesEdit.newText}`;
    }
    return [removeNewLinesEdit];
  }

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

  if (
    token.nextToken.pos.line === token.pos.line &&
    token.pos.colEnd === token.nextToken.pos.col
  ) {
    return [
      TextEdit.insert(
        Position.create(token.nextToken.pos.line, token.nextToken.pos.col),
        "".padEnd(expectedSpaces, tab ? "\t" : " ")
      ),
    ];
  }

  return [
    TextEdit.replace(
      Range.create(
        Position.create(token.pos.line, token.pos.colEnd),
        Position.create(token.nextToken.pos.line, token.nextToken.pos.col)
      ),
      "".padEnd(expectedSpaces, tab ? "\t" : " ")
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
  computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>
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
      if (node.labels.length && node.reference?.firstToken.prevToken) {
        result.push(
          ...fixedNumberOfSpaceBetweenTokensAndNext(
            node.reference.firstToken.prevToken,
            documentText
          )
        );
      }
      const nodeNameAndOpenCurlySpacing =
        node.reference && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(
              node.reference.lastToken,
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
    if (node.openScope && node.closeScope.prevToken === node.openScope) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(node.openScope, documentText)
      );
    } else {
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
  }

  if (node.lastToken.value === ";" && node.closeScope) {
    result.push(...moveNextTo(node.closeScope, node.lastToken));
  }

  return result;
};

const formatLabeledValue = <T extends ASTBase>(
  propertyNameWidth: number,
  value: LabeledValue<T>,
  level: number,
  settings: FormatingSettings,
  openBracket: Token | undefined,
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

  if (value.firstToken.prevToken) {
    if (
      value.firstToken.pos.line !== value.firstToken.prevToken?.pos.line &&
      value.firstToken.prevToken !== openBracket
    ) {
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
          level,
          settings.singleIndent,
          documentText,
          widthToPrefix(settings, propertyNameWidth + 4) // +4 ' = <'
        )
      );
    } else {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          value.firstToken.prevToken,
          documentText,
          openBracket && value.firstToken.prevToken === openBracket ? 0 : 1
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
  propertyNameWidth: number,
  value: AllValueType,
  level: number,
  settings: FormatingSettings,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (value instanceof ArrayValues || value instanceof ByteStringValue) {
    result.push(
      ...value.values.flatMap((v) =>
        formatLabeledValue(
          propertyNameWidth,
          v,
          level,
          settings,
          value.openBracket,
          documentText
        )
      )
    );

    if (value.closeBracket?.prevToken) {
      result.push(
        ...fixedNumberOfSpaceBetweenTokensAndNext(
          value.closeBracket.prevToken,
          documentText,
          value.closeBracket.prevToken === value.values.at(-1)?.lastToken
            ? 0
            : 1
        )
      );
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
  propertyNameWidth: number,
  value: PropertyValue,
  level: number,
  settings: FormatingSettings,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  result.push(...formatLabels(value.startLabels, documentText));

  result.push(
    ...formatValue(
      propertyNameWidth,
      value.value,
      level,
      settings,
      documentText
    )
  );

  result.push(...formatLabels(value.endLabels, documentText));

  return result;
};

const widthToPrefix = (settings: FormatingSettings, width: number): string => {
  if (settings.insertSpaces) {
    return "".padStart(width, " ");
  }

  const noOfTabs = Math.floor(width / settings.tabSize);
  const noOfSpace = width % settings.tabSize;
  return `${"".padStart(noOfTabs, "\t")}${"".padStart(noOfSpace, " ")}`;
};

const formatPropertyValues = (
  propertyNameWidth: number,
  values: PropertyValues,
  level: number,
  settings: FormatingSettings,
  documentText: string[]
): TextEdit[] => {
  const result: TextEdit[] = [];

  values.values.forEach((value, i) => {
    if (!value) return [];

    // ensure sameline or newline between  `< 10...` and what is before it
    const prevToken = value.firstToken.prevToken;
    const prevValue = i ? values.values.at(i - 1) : undefined;
    if (prevToken) {
      if (prevToken.pos.line === value.firstToken.pos.line) {
        if (
          prevToken.value === "," &&
          prevValue?.lastToken.pos.line !== value.firstToken.pos.line &&
          prevToken.prevToken?.pos.line !== value.firstToken.pos.line
        ) {
          const editToMoveToNewLine = pushItemToNewLineAndIndent(
            value.firstToken,
            level,
            settings.singleIndent,
            widthToPrefix(settings, propertyNameWidth + 3) // +3 ' = '
          );

          if (editToMoveToNewLine) {
            result.push(editToMoveToNewLine);
          }
        } else {
          result.push(
            ...fixedNumberOfSpaceBetweenTokensAndNext(
              prevToken,
              documentText,
              1
            )
          );
        }
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
            level,
            settings.singleIndent,
            documentText,
            widthToPrefix(settings, propertyNameWidth + 3) // +3 ' = '
          )
        );
      }
    }

    result.push(
      ...formatPropertyValue(
        propertyNameWidth,
        value,
        level,
        settings,
        documentText
      )
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
  settings: FormatingSettings,
  documentText: string[],
  uri: string
): TextEdit[] => {
  if (!isPathEqual(property.uri, uri)) return []; //property may have been included!!

  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      property.firstToken,
      level,
      settings.singleIndent,
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
        property.propertyName?.name.length ?? 0,
        property.values,
        level,
        settings,
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
  levelMeta: LevelMeta | undefined,
  indentString: string,
  documentText: string[]
): TextEdit[] => {
  // we should not format this case
  if (levelMeta === undefined) return [];

  if (!isPathEqual(includeItem.uri, uri)) return []; // may be coming from some other include  hence ignore

  const result: TextEdit[] = [];

  result.push(
    ...ensureOnNewLineAndMax1EmptyLineToPrev(
      includeItem.firstToken,
      levelMeta.level,
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
  levelMeta: LevelMeta | undefined,
  indentString: string,
  documentText: string[],
  settings: FormatingSettings
): TextEdit[] =>
  commentItem.comments.flatMap((c, i) =>
    formatBlockCommentLine(
      c,
      levelMeta,
      indentString,
      documentText,
      i
        ? i === commentItem.comments.length - 1
          ? "last"
          : "comment"
        : "first",
      settings
    )
  );

const getPropertyIndentPrefix = (
  settings: FormatingSettings,
  closestAst?: ASTBase,
  prifix: string = ""
) => {
  const property = closestAst ? getPropertyFromChild(closestAst) : undefined;
  if (!property) return prifix;
  const propertyValueChild = isPropertyValueChild(closestAst);
  const propertyNameWidth = property.propertyName?.name.length ?? 0;
  const witdhPrifix = `${widthToPrefix(
    settings,
    propertyNameWidth + (propertyValueChild ? 4 : 3) - prifix.length
  )}`;

  return `${witdhPrifix}${prifix}`; // +3 ' = ' or + 4 ' = <'
};

const formatBlockCommentLine = (
  commentItem: Comment,
  levelMeta: LevelMeta | undefined,
  indentString: string,
  documentText: string[],
  lineType: "last" | "first" | "comment",
  settings: FormatingSettings
): TextEdit[] => {
  const result: TextEdit[] = [];

  if (
    commentItem.firstToken.value === "/" &&
    commentItem.firstToken.nextToken &&
    commentItem.firstToken.nextToken.nextToken?.pos.line ===
      commentItem.firstToken.pos.line
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        commentItem.firstToken.nextToken,
        documentText
      )
    );
  }

  if (
    commentItem.firstToken.value === "/" &&
    commentItem.lastToken.value === "/" &&
    commentItem.lastToken.prevToken?.prevToken &&
    commentItem.lastToken.prevToken?.prevToken.pos.line ===
      commentItem.lastToken.pos.line
  ) {
    result.push(
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        commentItem.lastToken.prevToken.prevToken,
        documentText
      )
    );
  }

  if (!commentItem.firstToken.prevToken) {
    return [
      ...result,
      ...ensureOnNewLineAndMax1EmptyLineToPrev(
        commentItem.firstToken,
        levelMeta?.level ?? 0,
        indentString,
        documentText
      ),
    ];
  }

  const onSameLine =
    commentItem.firstToken.pos.line ===
    commentItem.firstToken.prevToken?.pos.line;
  if (onSameLine) {
    return [
      ...result,
      ...fixedNumberOfSpaceBetweenTokensAndNext(
        commentItem.firstToken.prevToken,
        documentText,
        1,
        undefined,
        true
      ),
    ];
  }

  if (levelMeta === undefined) {
    return [];
  }

  let prifix: string = "";
  const commentStr = commentItem.toString();
  if (
    lineType === "last" &&
    commentStr.trim() !== "" &&
    commentItem.lastToken.prevToken
  ) {
    lineType = "comment";
    result.push(
      ...ensureOnNewLineAndMax1EmptyLineToPrev(
        commentItem.lastToken.prevToken,
        levelMeta?.level ?? 0,
        indentString,
        documentText,
        " "
      )
    );
  }

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

  if (levelMeta?.inAst instanceof DtcBaseNode) {
    result.push(
      ...ensureOnNewLineAndMax1EmptyLineToPrev(
        commentItem.firstToken,
        levelMeta?.level ?? 0,
        indentString,
        documentText,
        prifix
      )
    );
  } else {
    result.push(
      ...ensureOnNewLineAndMax1EmptyLineToPrev(
        commentItem.firstToken,
        levelMeta?.level ?? 0,
        indentString,
        documentText,
        getPropertyIndentPrefix(settings, levelMeta?.inAst, prifix)
      )
    );
  }

  return result;
};

const formatComment = (
  commentItem: Comment,
  levelMeta: LevelMeta | undefined,
  indentString: string,
  documentText: string[],
  settings: FormatingSettings
): TextEdit[] => {
  if (!commentItem.firstToken.prevToken) {
    return ensureOnNewLineAndMax1EmptyLineToPrev(
      commentItem.firstToken,
      levelMeta?.level ?? 0,
      indentString,
      documentText
    );
  }

  const commentLine = commentItem.firstToken.pos.line;
  if (
    commentLine === commentItem.firstToken.prevToken.pos.line // e.g prop = 10; // foo
  ) {
    return fixedNumberOfSpaceBetweenTokensAndNext(
      commentItem.firstToken.prevToken,
      documentText,
      1,
      undefined,
      true
    );
  }

  return ensureOnNewLineAndMax1EmptyLineToPrev(
    commentItem.firstToken,
    levelMeta?.level ?? 0,
    indentString,
    documentText,
    getPropertyIndentPrefix(settings, levelMeta?.inAst)
  );
};

type FormatingSettings = {
  tabSize: number;
  insertSpaces: boolean;
  singleIndent: string;
};

const getTextEdit = async (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  uri: string,
  computeLevel: (astNode: ASTBase) => Promise<LevelMeta | undefined>,
  documentText: string[],
  level = 0
): Promise<TextEdit[]> => {
  const delta = documentFormattingParams.options.tabSize;
  const insertSpaces = documentFormattingParams.options.insertSpaces;
  const singleIndent = insertSpaces ? "".padStart(delta, " ") : "\t";
  const settings: FormatingSettings = {
    tabSize: delta,
    insertSpaces,
    singleIndent,
  };

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
    return formatDtcProperty(astNode, level, settings, documentText, uri);
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
      documentText,
      settings
    );
  } else if (astNode instanceof CommentBlock) {
    return formatCommentBlock(
      astNode,
      await computeLevel(astNode),
      singleIndent,
      documentText,
      settings
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
