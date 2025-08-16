/*
 * Copyright 2025 Kyle Micallef Bonnici
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

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { Node } from '../context/node';
import { Runtime } from '../context/runtime';
import { StringValue } from '../ast/dtc/values/string';
import { LabelRef } from '../ast/dtc/labelRef';
import { NodePathRef } from '../ast/dtc/values/nodePath';
import { ContextAware } from '../runtimeEvaluator';
export interface DTMacroInfo {
	macro: string;
	args?: DTMacroInfo[];
	parent?: DTMacroInfo;
	argIndexInParent?: number;
}

// ---------- helpers ----------

const isIdent = (ch: string) => /[A-Za-z0-9_]/.test(ch);

/** Find the index of the nearest *enclosing* '(' that is still open at `index`. */
function findEnclosingOpenParen(
	text: string,
	index: number,
): number | undefined {
	const stack: number[] = [];
	for (let i = 0; i < index; i++) {
		const c = text[i];
		if (c === '(') stack.push(i);
		else if (c === ')') stack.pop();
	}
	return stack.length ? stack[stack.length - 1] : undefined;
}

/** Find matching ')' given an open '(' at `openIdx`. */
function findMatchingCloseParen(
	text: string,
	openIdx: number,
): number | undefined {
	let depth = 1;
	for (let i = openIdx + 1; i < text.length; i++) {
		const c = text[i];
		if (c === '(') depth++;
		else if (c === ')') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return undefined;
}

/** Split an argument list segment [start,end] (exclusive end) into args and their ranges. */
function splitArgsWithRanges(text: string, start: number, end: number) {
	const ranges: Array<{ start: number; end: number; text: string }> = [];
	let depth = 0;
	let s = start;
	for (let i = start; i < end; i++) {
		const c = text[i];
		if (c === '(') depth++;
		else if (c === ')') depth--;
		else if (c === ',' && depth === 0) {
			// push arg s..i
			let a = s,
				b = i;
			while (a < b && /\s/.test(text[a])) a++;
			while (b > a && /\s/.test(text[b - 1])) b--;
			ranges.push({ start: a, end: b, text: text.slice(a, b) });
			s = i + 1;
		}
	}
	// last arg s..end
	let a = s,
		b = end;
	while (a < b && /\s/.test(text[a])) a++;
	while (b > a && /\s/.test(text[b - 1])) b--;
	if (a <= b) ranges.push({ start: a, end: b, text: text.slice(a, b) });
	// handle empty arglist: we’ll have a==b==end, keep a single empty range for consistency
	return ranges;
}

/** Parse a macro or literal string into DTMacroInfo, recursively (no source ranges). */
function parseNodeFromString(expr: string): DTMacroInfo {
	const trimmed = expr.trim();
	// Allow optional whitespace before '('
	const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/.exec(trimmed);
	if (!m) return { macro: trimmed };

	const name = m[1];
	const inner = m[2];

	// split args at top level
	let depth = 0,
		cur = '';
	const parts: string[] = [];
	for (const ch of inner) {
		if (ch === '(') {
			depth++;
			cur += ch;
		} else if (ch === ')') {
			depth--;
			cur += ch;
		} else if (ch === ',' && depth === 0) {
			parts.push(cur.trim());
			cur = '';
		} else {
			cur += ch;
		}
	}
	if (cur.trim() !== '' || inner.trim() === '') parts.push(cur.trim());

	const node: DTMacroInfo = { macro: name, args: [] };
	node.args = parts
		.filter((p) => p.length > 0 || inner.trim() === '') // keep empty only if truly empty arglist
		.map((p) => {
			const child = parseNodeFromString(p);
			child.parent = node;
			return child;
		});

	return node;
}

// ---------- main API ----------

/**
 * Find the macro/literal under cursor, with parent + argIndex info.
 * Returns a structured DTMacroInfo tree node (args are DTMacroInfo[]).
 */
export function getMacroAtPosition(
	document: TextDocument,
	position: Position,
): DTMacroInfo | undefined {
	const text = document.getText();
	const offset = document.offsetAt(position);

	// 1) Try to detect immediate token/call under cursor
	let start = offset,
		end = offset;

	// expand left/right over identifier chars
	while (start > 0 && isIdent(text[start - 1])) start--;
	while (end < text.length && isIdent(text[end])) end++;

	// if looks like a macro call (identifier followed by '('), expand to its matching ')'
	if (text[end] === '(') {
		const close = findMatchingCloseParen(text, end);
		if (close !== undefined) end = close + 1;
	}

	// Candidate node from local token/expression (may be literal or macro)
	const candidateSlice = text.slice(start, end);
	let candidate = candidateSlice.trim().length
		? parseNodeFromString(candidateSlice)
		: undefined;

	// 2) Now locate the *enclosing* parent macro (if any) that actually contains the cursor
	const openIdx = findEnclosingOpenParen(text, offset);
	if (openIdx === undefined) {
		// Not inside any parentheses → either top-level macro/literal at cursor, or nothing
		return candidate;
	}
	const closeIdx = findMatchingCloseParen(text, openIdx);
	if (closeIdx === undefined) return candidate; // malformed parentheses

	// Confirm the cursor is inside the paren pair
	if (!(openIdx < offset && offset <= closeIdx)) return candidate;

	// Macro name immediately before '('
	let nameEnd = openIdx;
	let nameStart = nameEnd;
	while (nameStart > 0 && isIdent(text[nameStart - 1])) nameStart--;
	const parentName = text.slice(nameStart, nameEnd);
	if (!parentName) return candidate;

	// Build a proper parent node with structured args
	const argRanges = splitArgsWithRanges(text, openIdx + 1, closeIdx);
	const parentNode: DTMacroInfo = { macro: parentName, args: [] };

	// parse each arg into a child node, wiring parent pointers
	parentNode.args = argRanges.map((r) => {
		const child = parseNodeFromString(r.text);
		child.parent = parentNode;
		return child;
	});

	// Which argument contains the cursor?
	let argIndex = -1;
	for (let i = 0; i < argRanges.length; i++) {
		const r = argRanges[i];
		// inclusive bounds so positions at the edges are considered inside
		if (offset >= r.start && offset <= r.end) {
			argIndex = i;
			break;
		}
	}

	if (argIndex >= 0) {
		// Prefer returning the *structured* child from the parent (ensures identity & correct parent)
		const child = parentNode.args![argIndex];
		child.argIndexInParent = argIndex;

		// If we expanded the local token to a full call and it matches this child,
		// return child; otherwise, parent (e.g., when cursor is on a comma/space).
		return child;
	}

	// If the cursor sits on a comma or outside any single arg, return the parent macro
	return parentNode;
}

export function findMacroDefinition(
	document: TextDocument,
	macro: string,
	endPosition: Position,
): Position | undefined {
	const text = document.getText();
	const lines = text.split(/\r?\n/);

	// Regex: match #define MACRO or #define MACRO(...)
	// Capture 1: macro name
	// Capture 2: parameters (optional)
	const re = new RegExp(
		`^\\s*#\\s*define\\s+(${macro})(\\s*\\([^)]*\\))?\\s*(.*)$`,
	);

	for (
		let lineNum = 0;
		lineNum < Math.min(endPosition.line + 1, lines.length);
		lineNum++
	) {
		const line = lines[lineNum];
		const m = re.exec(line);
		if (m) {
			// The definition text starts after the macro name + optional params
			const beforeDef = line.indexOf(m[0]);
			const defOffset = line.indexOf(m[3], beforeDef);

			return Position.create(
				lineNum,
				defOffset >= 0 ? defOffset : line.length,
			);
		}
	}

	return undefined;
}

export function toCIdentifier(name: string) {
	return name.toLowerCase().replace(/[@,-]/g, '_');
}

export async function resolveDtAlias(alias: string, context: ContextAware) {
	const runtime = await context?.getRuntime();

	if (runtime) {
		let node: Node | undefined = Runtime.getNodeFromPath(
			['aliases'],
			runtime.rootNode,
			true,
		);

		const property = node?.property.find((p) => p.name === alias);

		if (!property) {
			return;
		}

		const values = property.ast.getFlatAstValues();

		if (values?.[0] instanceof StringValue) {
			node = runtime.rootNode.getChild(values[0].value.split('/'));
		} else if (values?.[0] instanceof LabelRef) {
			node = values[0].linksTo;
		} else if (values?.[0] instanceof NodePathRef) {
			node = values[0].path?.pathParts.at(-1)?.linksTo;
		}

		return node;
	}
}

export async function resolveDtChild(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
) {
	if (macro.args?.length !== 2) return;

	const runtime = await context?.getRuntime();

	if (runtime) {
		const node = await resolveDTMacroToNode(
			document,
			macro.args[0],
			context,
			position,
		);

		const childName = macro.args[1].macro;

		if (!node) {
			return;
		}

		let childNode = node.nodes.find(
			(c) => toCIdentifier(c.name) === childName,
		);

		return childNode;
	}
}

export async function resolveDTMacroToNode(
	document: TextDocument,
	macro: DTMacroInfo,
	context: ContextAware,
	position: Position,
): Promise<Node | undefined> {
	switch (macro.macro) {
		case 'DT_ALIAS':
			return macro.args?.[0]
				? resolveDtAlias(macro.args[0].macro, context)
				: undefined;
		case 'DT_CHILD':
			return resolveDtChild(document, macro, context, position);
	}

	const newPosition = findMacroDefinition(document, macro.macro, position);
	if (!newPosition) {
		return;
	}

	const newMacro = getMacroAtPosition(document, newPosition);
	if (!newMacro) {
		return;
	}

	return resolveDTMacroToNode(document, newMacro, context, newPosition);
}
