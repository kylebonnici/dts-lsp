import { ByteStringValue } from "./values/byteString";
import { StringValue } from "./values/string";
import { LabelRef } from "./labelRef";
import { ArrayValues } from "./values/arrayValue";
import { NodePathRef } from "./values/nodePath";

export type AllValueType =
  | StringValue
  | ByteStringValue
  | ArrayValues
  | LabelRef
  | NodePathRef
  | null;

export type LabelValue = { ast: LabelRef; label: string };
