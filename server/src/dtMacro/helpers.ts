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

import { spawn } from 'child_process';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { fileURLToPath, isPathEqual } from '../helpers';
import { ContextAware } from '../runtimeEvaluator';

export type ResolveMacroRequest = {
	document: TextDocument;
	macro: DTMacroInfo;
	context: ContextAware;
	position: Position;
};
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

/** Split an argument list segment [start,end) into args, respecting () and quotes. */
function splitArgsWithRanges(text: string, start: number, end: number) {
	const ranges: Array<{ start: number; end: number; text: string }> = [];
	let depth = 0;
	let inSingle = false,
		inDouble = false;
	let s = start;

	for (let i = start; i < end; i++) {
		const c = text[i];
		if (c === "'" && !inDouble) inSingle = !inSingle;
		else if (c === '"' && !inSingle) inDouble = !inDouble;
		else if (!inSingle && !inDouble) {
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === ',' && depth === 0) {
				// raw bounds for hit-testing
				const rawStart = s;
				const rawEnd = i;

				// trimmed slice for parsing text
				let a = rawStart,
					b = rawEnd;
				while (a < b && /\s/.test(text[a])) a++;
				while (b > a && /\s/.test(text[b - 1])) b--;

				ranges.push({
					start: rawStart,
					end: rawEnd,
					text: text.slice(a, b),
				});
				s = i + 1;
			}
		}
	}

	// last arg (up to `end`, which is the index of ')')
	const rawStart = s;
	const rawEnd = end;

	let a = rawStart,
		b = rawEnd;
	while (a < b && /\s/.test(text[a])) a++;
	while (b > a && /\s/.test(text[b - 1])) b--;

	ranges.push({ start: rawStart, end: rawEnd, text: text.slice(a, b) });

	return ranges;
}

/** Parse a macro or literal string into DTMacroInfo, recursively. */
function parseNodeFromString(expr: string): DTMacroInfo {
	const trimmed = expr.trim();
	// Use [\s\S]* to match across newlines and include quotes
	const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]*)\)$/.exec(trimmed);
	if (!m) return { macro: trimmed };

	const name = m[1];
	const inner = m[2];

	const ranges = splitArgsWithRanges(inner, 0, inner.length);
	const node: DTMacroInfo = { macro: name, args: [] };
	node.args = ranges.map((r) => {
		const child = parseNodeFromString(r.text);
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

export function findMacroDefinitionPosition(
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
		`^\\s*#\\s*define\\s+(${macro})\\b(\\s*\\([^)]*\\))?\\s*(.*)$`,
	);

	// Scan backwards from the cursor line
	for (
		let lineNum = Math.min(endPosition.line, lines.length - 1);
		lineNum >= 0;
		lineNum--
	) {
		const line = lines[lineNum];
		const m = re.exec(line);
		if (m) {
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

export async function findMacroDefinition(
	document: TextDocument,
	macro: string,
	position: Position,
	context: ContextAware,
): Promise<[DTMacroInfo, Position] | undefined> {
	let result = findMacroDefinitionFromDocument(document, macro, position);
	if (result) {
		return result;
	}

	const fromCompileCommand = await findFromCompiledCommand(
		macro,
		context,
		fileURLToPath(document.uri),
	);

	if (fromCompileCommand) {
		return [fromCompileCommand, position];
	}
}

export function findMacroDefinitionFromDocument(
	document: TextDocument,
	macro: string,
	position: Position,
): [DTMacroInfo, Position] | undefined {
	if (macro.startsWith('DT_')) {
		return;
	}

	const newPosition = findMacroDefinitionPosition(document, macro, position);
	if (!newPosition) {
		return;
	}
	const result = getMacroAtPosition(document, newPosition);

	if (result) {
		return [result, newPosition];
	}
}

const runAndCollectStdOut = (command: string, args: string[]) => {
	return new Promise<string>((resolve) => {
		const child = spawn(command, args, {
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';

		child.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});

		child.on('close', (code) => {
			if (code) {
				resolve('');
			} else {
				resolve(stdout);
			}
		});
	});
};

async function findFromCompiledCommand(
	macro: string,
	context: ContextAware,
	file: string,
): Promise<DTMacroInfo | undefined> {
	const compileCommand = context
		.getCompileCommands()
		?.find((c) => isPathEqual(c.file, file));

	if (!compileCommand) {
		return;
	}

	const newCompileCommandHeaders = `${compileCommand.command.replace(
		/-(o|c)\s+\S+/g,
		'',
	)} -E -dM ${compileCommand.file}`;

	try {
		const [command, ...args] = newCompileCommandHeaders.split(' ');
		const macros = await runAndCollectStdOut(
			command,
			args.filter((v) => !!v),
		);
		const document = TextDocument.create(
			`macros://${compileCommand.file}`,
			'devicetree',
			0,
			macros,
		);

		const result = findMacroDefinitionFromDocument(
			document,
			macro,
			document.positionAt(macros.length - 1),
		);

		if (result) {
			return result[0];
		}
	} catch (e) {
		console.error(e);
		//
	}
}

export function toCIdentifier(name: string) {
	return name.toLowerCase().replace(/[@,-\.]/g, '_');
}
