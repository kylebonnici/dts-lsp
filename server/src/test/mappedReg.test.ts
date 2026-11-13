/*
 * Copyright 2026 Kyle Micallef Bonnici
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

import fs from 'fs';
import { describe, test, jest, expect, beforeEach } from '@jest/globals';
import { resetTokenizedDocumentProvider } from '../providers/tokenizedDocument';
import { ContextAware } from '../runtimeEvaluator';
import { SerializedNode } from '../types/index';
import {
	createReservedContext,
	defaultEditorSettings,
	filePathUri,
	getFakeBindingLoader,
} from './helpers';

jest.mock('fs', () => ({
	readFileSync: jest.fn().mockImplementation(() => {
		throw new Error('readFileSync - Not mocked');
	}),
	existsSync: jest.fn().mockImplementation(() => {
		return true;
	}),
}));

const flashDts = (
	flashRanges: string,
	partitionsRanges: string,
	reg: string,
) => `/ {
	#address-cells = <1>; #size-cells = <1>;
	soc {
		#address-cells = <1>; #size-cells = <1>; ranges;
		flash@10000000 {
			#address-cells = <1>; #size-cells = <1>;
			reg = <0x10000000 0x400000>;
			${flashRanges}
			partitions {
				#address-cells = <1>; #size-cells = <1>;
				${partitionsRanges}
				partition@1000 { reg = <${reg}>; };
			};
		};
	};
};`;

const partitionPath = [
	'/',
	'soc',
	'flash@10000000',
	'partitions',
	'partition@1000',
];

const serializedReg = async (dts: string, path = partitionPath) => {
	(fs.readFileSync as unknown as jest.Mock).mockImplementation(() => dts);
	const context = new ContextAware(
		createReservedContext(filePathUri),
		defaultEditorSettings,
		getFakeBindingLoader(),
	);
	await context.parser.stable;
	const runtime = await context.getRuntime();
	const node = runtime.rootNode.getChild(path);
	expect(node).toBeDefined();

	const result: Record<string, SerializedNode> = {};
	node!.serialize(result, runtime.context.macros);
	return result[node!.pathString].reg?.map((r) => ({
		startAddress: r.startAddress,
		mappedStartAddress: r.mappedStartAddress,
		size: r.size,
		mappedTo: r.mappedTo,
	}));
};

describe('Mapped reg', () => {
	beforeEach(() => {
		resetTokenizedDocumentProvider();
	});

	const flashRanges = 'ranges = <0x0 0x10000000 0x400000>;';
	const partitionsPath = '/soc/flash@10000000/partitions';

	test('keeps the original reg address through an empty ranges', async () => {
		expect(
			await serializedReg(
				flashDts(flashRanges, 'ranges;', '0x1000 0x2000'),
			),
		).toEqual([
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x10001000],
				size: [0x2000],
				mappedTo: '/',
			},
		]);
	});

	test('keeps the original reg address through multiple ranges levels', async () => {
		expect(
			await serializedReg(
				flashDts(
					flashRanges,
					'ranges = <0x0 0x8000 0x80000>;',
					'0x1000 0x2000',
				),
			),
		).toEqual([
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x10009000],
				size: [0x2000],
				mappedTo: '/',
			},
		]);
	});

	test('maps each reg entry independently, in reg property order', async () => {
		const mapped = {
			startAddress: [0x1000],
			mappedStartAddress: [0x10001000],
			size: [0x2000],
			mappedTo: '/',
		};
		const unmapped = {
			startAddress: [0x200000],
			mappedStartAddress: [0x200000],
			size: [0x1000],
			mappedTo: partitionsPath,
		};

		expect(
			await serializedReg(
				flashDts(
					flashRanges,
					'ranges = <0x0 0x0 0x80000>;',
					'0x1000 0x2000 0x200000 0x1000',
				),
			),
		).toEqual([mapped, unmapped]);

		resetTokenizedDocumentProvider();
		expect(
			await serializedReg(
				flashDts(
					flashRanges,
					'ranges = <0x0 0x0 0x80000>;',
					'0x200000 0x1000 0x1000 0x2000',
				),
			),
		).toEqual([unmapped, mapped]);
	});

	test('keeps entries of a pair mapped by several ranges entries together', async () => {
		expect(
			await serializedReg(
				flashDts(
					flashRanges,
					'ranges = <0x0 0x0 0x80000 0x0 0x100000 0x80000>;',
					'0x3000 0x1000 0x1000 0x1000',
				),
			),
		).toEqual([
			{
				startAddress: [0x3000],
				mappedStartAddress: [0x10003000],
				size: [0x1000],
				mappedTo: '/',
			},
			{
				startAddress: [0x3000],
				mappedStartAddress: [0x10103000],
				size: [0x1000],
				mappedTo: '/',
			},
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x10001000],
				size: [0x1000],
				mappedTo: '/',
			},
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x10101000],
				size: [0x1000],
				mappedTo: '/',
			},
		]);
	});

	test('stops at a parent without ranges', async () => {
		expect(await serializedReg(flashDts('', '', '0x1000 0x2000'))).toEqual([
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x1000],
				size: [0x2000],
				mappedTo: partitionsPath,
			},
		]);
	});

	test('reports the highest node of an empty ranges chain it stops in', async () => {
		expect(
			await serializedReg(flashDts('', 'ranges;', '0x1000 0x2000')),
		).toEqual([
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x1000],
				size: [0x2000],
				mappedTo: '/soc/flash@10000000',
			},
		]);
	});

	test('reports the parent space of an entry that exceeds its ranges window', async () => {
		expect(
			await serializedReg(
				flashDts(
					flashRanges,
					'ranges = <0x0 0x0 0x2000>;',
					'0x1000 0x2000',
				),
			),
		).toEqual([
			{
				startAddress: [0x1000],
				mappedStartAddress: [0x1000],
				size: [0x2000],
				mappedTo: '/soc/flash@10000000',
			},
		]);
	});

	test('reports the root for a node directly under it', async () => {
		expect(
			await serializedReg(
				`/ { #address-cells = <1>; #size-cells = <1>; memory@20000000 { reg = <0x20000000 0x1000>; }; };`,
				['/', 'memory@20000000'],
			),
		).toEqual([
			{
				startAddress: [0x20000000],
				mappedStartAddress: [0x20000000],
				size: [0x1000],
				mappedTo: '/',
			},
		]);
	});
});
