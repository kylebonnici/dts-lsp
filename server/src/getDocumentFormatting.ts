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

export function getDocumentFormatting(
  documentFormattingParams: DocumentFormattingParams,
  contextAware: ContextAware[]
): TextEdit[] {
  const parser = contextAware.find(
    (c) =>
      c.parser.uri ===
      documentFormattingParams.textDocument.uri.replace("file://", "")
  );

  return parser
    ? parser.parser.allAstItems.flatMap((base) =>
        getTextEdit(documentFormattingParams, base)
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
      throw new Error("removenewLinesEdit must be defined");
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
  level: number
): TextEdit[] => {
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
        node.labelReferance && node.openScope
          ? fixedNumberOfSpaceBetweenTokensAndNext(
              node.labelReferance.lastToken,
              0
            )
          : [];
      result.push(...nodeNameAndOpenCurlySpacing);
    }
  }

  result.push(
    ...node.children.flatMap((c) =>
      getTextEdit(documentFormattingParams, c, level + 1)
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

  const endStatmentSpacing =
    node.lastToken.value === ";" && node.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(node.lastToken.prevToken, 0)
      : [];

  result.push(...endStatmentSpacing);

  return result;
};

const formatLabledValue = <T extends ASTBase>(
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
        formatLabledValue(documentFormattingParams, v, level, i)
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
  level: number
): TextEdit[] => {
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

  const endStatmentSpacing =
    property.lastToken.value === ";" && property.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(property.lastToken.prevToken, 0)
      : [];

  result.push(...endStatmentSpacing);

  return result;
};

const formatDtcDelete = (
  documentFormattingParams: DocumentFormattingParams,
  deleteItem: DeleteBase,
  level: number
): TextEdit[] => {
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

  const endStatmentSpacing =
    deleteItem.lastToken.value === ";" && deleteItem.lastToken.prevToken
      ? fixedNumberOfSpaceBetweenTokensAndNext(
          deleteItem.lastToken.prevToken,
          0
        )
      : [];

  result.push(...endStatmentSpacing);

  return result;
};

const getTextEdit = (
  documentFormattingParams: DocumentFormattingParams,
  astNode: ASTBase,
  level = 0
): TextEdit[] => {
  const delta = documentFormattingParams.options.tabSize;
  const expectedIndent = level * delta;

  if (astNode instanceof DtcBaseNode) {
    return formatDtcNode(documentFormattingParams, astNode, level);
  } else if (astNode instanceof DtcProperty) {
    return formatDtcProperty(documentFormattingParams, astNode, level);
  } else if (astNode instanceof DeleteBase) {
    return formatDtcDelete(documentFormattingParams, astNode, level);
  }

  return [];
};
