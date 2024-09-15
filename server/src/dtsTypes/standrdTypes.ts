import { type Node } from '../context/node';
import { NodeType, PropertyNodeType, PropetyType } from './types';

const compatibleType = new PropertyNodeType('compatible', PropetyType.STRINGLIST);
const modelType = new PropertyNodeType('model', PropetyType.STRING);
const phandelType = new PropertyNodeType('phandle', PropetyType.PHANDEL);
const statusType = new PropertyNodeType('status', PropetyType.STRING, false, 'okay', [
	'okay',
	'disabled',
	'reserved',
	'fail',
	'fail-sss',
]);

export function getStandardType(node: Node) {
	const standardType = new NodeType(node);
	standardType.properties.push(compatibleType, modelType, phandelType, statusType);
	return standardType;
}
