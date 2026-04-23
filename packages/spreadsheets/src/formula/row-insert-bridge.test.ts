import { describe, expect, it } from "bun:test";
import { createFormulaBridge, type FormulaBridge } from "./bridge";
import type { CellValue } from "../types";
import { Result } from "../internal/result";

// ── Mock Engine ──────────────────────────────────────────────────────────────
// Reusable mock HyperFormula that evaluates simple =REF+REF and =REF*N formulas.

function columnLettersToIndex(input: string): number {
	let index = 0;
	for (const char of input) {
		index = index * 26 + (char.charCodeAt(0) - 64);
	}
	return index - 1;
}

function createTestBridge(engine: ReturnType<typeof createMockEngine>): FormulaBridge {
	const result = createFormulaBridge({ instance: engine, sheetName: "Test" });
	if (!Result.isOk(result) || !result.value) {
		throw new Error("Expected formula bridge");
	}
	return result.value;
}

function parseCellReference(reference: string) {
	const match = /^([A-Z]+)(\d+)$/.exec(reference.trim().toUpperCase());
	if (!match) return null;
	return {
		col: columnLettersToIndex(match[1]!),
		row: Number(match[2]) - 1,
	};
}

function createMockEngine() {
	const sheetIds = new Map<string, number>();
	const sheetContents = new Map<number, unknown[][]>();
	const handlers = new Map<string, Set<(...args: unknown[]) => void>>();
	let nextSheetId = 0;

	function ensureSheet(sheetId: number) {
		const existing = sheetContents.get(sheetId);
		if (existing) return existing;
		const created: unknown[][] = [];
		sheetContents.set(sheetId, created);
		return created;
	}

	function evaluateCell(sheetId: number, row: number, col: number, seen = new Set<string>()): unknown {
		const key = `${sheetId}:${row}:${col}`;
		if (seen.has(key)) return "#CYCLE!";
		seen.add(key);

		const raw = sheetContents.get(sheetId)?.[row]?.[col] ?? null;
		if (typeof raw !== "string" || !raw.startsWith("=")) return raw;

		const expression = raw.slice(1).trim();

		// Handle =REF*N  (e.g. =B1*2)
		const mulMatch = expression.match(/^([A-Z]+\d+)\*(\d+)$/i);
		if (mulMatch) {
			const ref = parseCellReference(mulMatch[1]!);
			if (!ref) return "#ERROR!";
			const value = evaluateCell(sheetId, ref.row, ref.col, seen);
			if (typeof value !== "number") return "#ERROR!";
			return value * Number(mulMatch[2]);
		}

		// Handle =REF+REF (addition)
		const parts = expression.split("+").map((p) => p.trim());
		let sum = 0;
		for (const part of parts) {
			const ref = parseCellReference(part);
			if (!ref) return "#ERROR!";
			const value = evaluateCell(sheetId, ref.row, ref.col, seen);
			if (typeof value !== "number") return 0; // treat non-number as 0
			sum += value;
		}
		return sum;
	}

	return {
		addSheet(name = `Sheet${nextSheetId + 1}`) {
			const id = nextSheetId++;
			sheetIds.set(name, id);
			sheetContents.set(id, []);
			return name;
		},
		getSheetId(name: string) {
			return sheetIds.get(name);
		},
		setSheetContent(sheetId: number, data: unknown[][]) {
			sheetContents.set(sheetId, data.map((row) => [...row]));
		},
		setCellContents(address: { sheet: number; row: number; col: number }, value: unknown) {
			const sheet = ensureSheet(address.sheet);
			while (sheet.length <= address.row) sheet.push([]);
			while ((sheet[address.row]?.length ?? 0) <= address.col) sheet[address.row]!.push(null);
			sheet[address.row]![address.col] = value;
		},
		getCellValue(address: { sheet: number; row: number; col: number }) {
			return evaluateCell(address.sheet, address.row, address.col);
		},
		setRowOrder(_sheetId: number, _order: number[]) { return true; },
		isItPossibleToSetRowOrder() { return true; },
		on(event: string, callback: (...args: unknown[]) => void) {
			const reg = handlers.get(event) ?? new Set();
			reg.add(callback);
			handlers.set(event, reg);
		},
		off(event: string, callback: (...args: unknown[]) => void) {
			handlers.get(event)?.delete(callback);
		},
		emitValuesUpdated(changes: unknown[]) {
			for (const handler of handlers.get("valuesUpdated") ?? []) handler(changes);
		},
		/** Expose raw sheet data for assertions */
		getRawSheet(sheetId: number) {
			return sheetContents.get(sheetId);
		},
	};
}

// ═════════════════════════════════════════════════════════════════════════════
// Group 2 — Engine + HyperFormula: after insertRows, the formula bridge must
// be synced so getDisplayValue returns correct computed values, not stale data
// or literal formula text.
// ═════════════════════════════════════════════════════════════════════════════

describe("formula bridge must be synced after row insert", () => {
	it("getDisplayValue returns a number, not literal formula text, after row insert", () => {
		const engine = createMockEngine();
		const bridge = createTestBridge(engine);

		const data: CellValue[][] = [
			[1, 2, "=A1+B1"],
			[3, 4, "=A2+B2"],
		];
		bridge.syncAll(data);

		// Before insert, formulas evaluate correctly
		expect(bridge.getDisplayValue(0, 2, "=A1+B1")).toBe(3);
		expect(bridge.getDisplayValue(1, 2, "=A2+B2")).toBe(7);

		// Simulate what insertRows SHOULD do:
		// Insert empty row at index 1, shift data down.
		// Formula text should be rewritten: =A2+B2 → =A3+B3
		const postInsertData: CellValue[][] = [
			[1, 2, "=A1+B1"],
			[null, null, null],       // inserted
			[3, 4, "=A3+B3"],        // shifted + rewritten
		];
		bridge.syncAll(postInsertData);

		// After sync, formulas must evaluate correctly against the new layout
		const display0 = bridge.getDisplayValue(0, 2, "=A1+B1");
		expect(display0).toBe(3); // 1+2

		const display2 = bridge.getDisplayValue(2, 2, "=A3+B3");
		expect(display2).toBe(7); // 3+4

		// The inserted row should have no formula
		expect(bridge.getDisplayValue(1, 2, null)).toBeNull();
	});

	it("display values reflect the new layout, not stale cache from old positions", () => {
		const engine = createMockEngine();
		const bridge = createTestBridge(engine);

		// Hero sheet scenario: D column has row-sum formulas
		const data: CellValue[][] = [
			[48, 52, "=A1+B1"],    // row 0: 100
			[32, 35, "=A2+B2"],    // row 1: 67
			[28, 31, "=A3+B3"],    // row 2: 59
		];
		bridge.syncAll(data);

		expect(bridge.getDisplayValue(2, 2, "=A3+B3")).toBe(59);

		// After inserting a row at index 2, Marketing shifts to row 3.
		// If we sync the new layout:
		const postInsert: CellValue[][] = [
			[48, 52, "=A1+B1"],    // row 0: still 100
			[32, 35, "=A2+B2"],    // row 1: still 67
			[null, null, null],    // row 2: inserted
			[28, 31, "=A4+B4"],    // row 3: Marketing, formula rewritten
		];
		bridge.syncAll(postInsert);

		// D4 (row 3) should evaluate to 28+31 = 59, NOT 226 or any stale value
		const displayD4 = bridge.getDisplayValue(3, 2, "=A4+B4");
		expect(displayD4).toBe(59);
	});

	it("cell edit after row insert evaluates against the new layout", () => {
		// Website bug: user types =C4 in B5 after inserting a row.
		// HF was never synced, so =C4 evaluates against old grid → gets "Sum" instead of 31.
		const engine = createMockEngine();
		const bridge = createTestBridge(engine);

		const data: CellValue[][] = [
			["Engineering", 48, 52, "=B1+C1"],
			["Design", 32, 35, "=B2+C2"],
			["Marketing", 28, 31, "=B3+C3"],
			[null, null, "Sum", 226],
		];
		bridge.syncAll(data);

		// Insert a row at index 2 and re-sync with the new layout
		const postInsert: CellValue[][] = [
			["Engineering", 48, 52, "=B1+C1"],
			["Design", 32, 35, "=B2+C2"],
			[null, null, null, null],               // inserted
			["Marketing", 28, 31, "=B4+C4"],       // shifted + rewritten
			[null, null, "Sum", 226],
		];
		bridge.syncAll(postInsert);

		// Now user writes =C4 in B5 (0-indexed: row 4, col 1)
		bridge.setCell(4, 1, "=C4");

		// C4 in the new layout = row 3 col 2 = 31 (Marketing's Q2)
		const display = bridge.getDisplayValue(4, 1, "=C4");
		expect(display).toBe(31);
		// Must NOT be "Sum" (which would mean HF is using the old grid)
	});
});

// ═════════════════════════════════════════════════════════════════════════════
// Group 2b — syncAll must be called after insertRows
//
// Tests the contract: after the store does insertRows, someone (the library
// or the host) must call formulaBridge.syncAll with the updated cell data.
// These tests verify that IF syncAll is called, everything works.  The actual
// wiring (making sure it IS called) is tested at the integration level.
// ═════════════════════════════════════════════════════════════════════════════

describe("syncAll produces correct HF state after structural changes", () => {
	it("formula added to a new row after sync evaluates correctly", () => {
		const engine = createMockEngine();
		const bridge = createTestBridge(engine);

		bridge.syncAll([
			[10, 20],
			[30, 40],
		]);

		// Expand and re-sync (simulates insert + sync)
		bridge.syncAll([
			[10, 20],
			[null, null],  // inserted
			[30, 40],
		]);

		// Write a formula into the new row
		bridge.setCell(1, 0, "=A1+A3");

		// A1=10, A3=30 → 40
		expect(bridge.getDisplayValue(1, 0, "=A1+A3")).toBe(40);
	});

	it("multiple inserts + sync keeps all formulas coherent", () => {
		const engine = createMockEngine();
		const bridge = createTestBridge(engine);

		bridge.syncAll([
			[1, "=A1+A2"],  // row 0: 1+2=3
			[2, null],       // row 1
		]);

		expect(bridge.getDisplayValue(0, 1, "=A1+A2")).toBe(3);

		// Insert 2 rows at top, shift everything, rewrite, re-sync
		bridge.syncAll([
			[null, null],        // inserted
			[null, null],        // inserted
			[1, "=A3+A4"],      // shifted + rewritten
			[2, null],
		]);

		// =A3+A4 → A3=1, A4=2 → 3
		expect(bridge.getDisplayValue(2, 1, "=A3+A4")).toBe(3);
	});
});
