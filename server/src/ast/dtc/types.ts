import { ByteStringValue } from './values/byteString';
import { LabelRefValue } from './values/labelRef';
import { NodePathValue } from './values/nodePath';
import { StringValue } from './values/string';
import { LabelRef } from './labelRef';
import { NumberValues } from './values/number';

export type AllValueType =
	| NodePathValue
	| LabelRefValue
	| StringValue
	| ByteStringValue
	| NumberValues
	| LabelRef
	| null;
