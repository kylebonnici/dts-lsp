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

import { addWords, compareWords } from './helpers';
import { DomainTree, GroupedMemoryView, TreeNode } from './types/index';

// Helper to format hex
const toHex = (num: number[]) =>
	`0x${num.map((c, i) => c.toString(16).padStart(i ? 8 : 0, '0')).join('')}`;

// ------------------------
// Insert partition into a tree node
// ------------------------
function insertNode(
	root: TreeNode | DomainTree,
	partition: GroupedMemoryView['partitions'][0],
) {
	const nodePath = partition.nodePath;
	let label = partition.labels.at(0);
	if (partition.disabled) {
		label += ' <DISABLED>';
	}
	const nodeName = partition.nodePath.split('/').pop() ?? partition.nodePath;
	const name = label ? `${label} (${nodeName})` : nodeName;

	// Find children that strictly contain this partition
	const candidates = root.children.filter((child) => {
		const partitionEnd = addWords(partition.start, partition.size);
		const childEnd = addWords(child.start, child.size);

		const startsInside = compareWords(partition.start, child.start) >= 0;

		const endsInside = compareWords(partitionEnd, childEnd) <= 0;

		const exactMatch =
			compareWords(partition.start, child.start) === 0 &&
			compareWords(partition.size, child.size) === 0;

		return startsInside && endsInside && !exactMatch;
	});

	if (candidates.length > 0) {
		for (const candidate of candidates) {
			insertNode(candidate, partition);
		}
		return;
	}

	root.children.push({
		name,
		start: partition.start,
		size: partition.size,
		children: [],
		path: nodePath,
		disabled: partition.disabled,
	});
}

// ------------------------
// Build trees grouped by MemoryItem.name
// ------------------------
function buildTrees(data: GroupedMemoryView[]): Record<string, DomainTree> {
	const trees: Record<string, DomainTree> = {};

	for (const item of data) {
		const root: DomainTree = {
			name: item.name,
			children: [],
			path: item.path,
		};

		for (const partition of item.partitions) {
			insertNode(root, partition);
		}

		trees[item.name] = root;
	}

	return trees;
}

// ------------------------
// Convert tree node to string
// ------------------------
function treeToString(
	node: Omit<TreeNode, 'disabled'> | DomainTree,
	prefix = '',
	isLast = true,
): string {
	// Group children by same start & size
	const grouped: Record<string, TreeNode[]> = {};
	for (const child of node.children) {
		const key = `${child.start}-${child.size}`;
		if (!grouped[key]) grouped[key] = [];
		grouped[key].push(child);
	}

	let result = '';
	const connector = prefix ? (isLast ? '└─ ' : '├─ ') : '';

	const meta: string[] = [];
	if ('start' in node && node.start.length)
		meta.push(`start: ${toHex(node.start)}`);
	if ('size' in node && node.size.length)
		meta.push(`size: ${toHex(node.size)}`);
	const metaString = meta.length > 0 ? `[${meta.join(', ')}]` : '';

	// Node name (could be multiple merged)
	const nodeName = node.name;
	result += `${prefix}${connector}${nodeName} ${metaString}\n`;

	const newPrefix = prefix + (isLast ? '   ' : '│  ');

	// Render grouped children
	const keys = Object.keys(grouped);
	keys.forEach((key, i) => {
		const group = grouped[key];
		// Merge names
		const names = Array.from(new Set(group.map((c) => c.name))).join(', ');

		// Merge children and deduplicate
		const mergedChildrenMap: Record<string, TreeNode> = {};
		group.forEach((c) => {
			c.children.forEach((child) => {
				const childKey = `${child.start}-${child.size}-${child.name}`;
				mergedChildrenMap[childKey] = child;
			});
		});
		const mergedChildren = Object.values(mergedChildrenMap);

		const mergedNode: Omit<TreeNode, 'disabled'> = {
			name: names,
			start: group[0].start,
			size: group[0].size,
			children: mergedChildren,
			path: node.path,
		};

		result += treeToString(mergedNode, newPrefix, i === keys.length - 1);
	});

	return result;
}

// ------------------------
// Convert all trees to a single string
// ------------------------
export function convertMemoryToTree(data: GroupedMemoryView[]) {
	return buildTrees(data);
}

export function convertTreeToString(trees: Record<string, DomainTree>) {
	return Object.values(trees)
		.map((tree) => treeToString(tree))
		.join('\n');
}
