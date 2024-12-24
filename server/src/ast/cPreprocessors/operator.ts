import { TokenIndexes } from "../../types";
import { ASTBase } from "../base";

export enum OperatorType {
  BIT_AND = "&",
  BIT_OR = "|",
  BIT_NOT = "!",
  BIT_XOR = "^",
  BIT_RIGHT_SHIFT = "<<",
  BIT_LEFT_SHIFT = ">>",
  ARITHMETIC_ADD = "+",
  ARITHMETIC_DIVIDE = "/",
  ARITHMETIC_MODULES = "%",
  ARITHMETIC_MULTIPLE = "*",
  ARITHMETIC_SUBTRACT = "-",
  BOOLEAN_GT = ">",
  BOOLEAN_AND = "&&",
  BOOLEAN_GT_EQUAL = ">=",
  BOOLEAN_LT_EQUAL = "<=",
  BOOLEAN_NOT_EQ = "==",
  BOOLEAN_OR = "||",
  C_CONCAT = "##",
}

export class Operator extends ASTBase {
  constructor(
    public readonly operator: OperatorType,
    tokenIndexe: TokenIndexes
  ) {
    super(tokenIndexe);
    this.semanticTokenType = "operator";
    this.semanticTokenModifiers = "declaration";
  }

  toString() {
    return this.operator;
  }
}
