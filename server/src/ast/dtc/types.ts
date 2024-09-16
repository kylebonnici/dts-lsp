import { ByteStringValue } from './values/byteString';
import { StringValue } from './values/string';
import { LabelRef } from './labelRef';
import { ArrayValues } from './values/arrayValue';

export type AllValueType = StringValue | ByteStringValue | ArrayValues | LabelRef | null;

export type LabelValue = { ast: LabelRef; label: string };
