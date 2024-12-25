import { Issue, StandardTypeIssue } from "../../types";
import { PropertyNodeType, PropetyType } from "../types";
import { generateOrTypeObj } from "./helpers";
import { genIssue } from "../../helpers";
import { DiagnosticSeverity } from "vscode-languageserver";

export default () =>
  new PropertyNodeType("interrupt-parent", generateOrTypeObj(PropetyType.U32));
