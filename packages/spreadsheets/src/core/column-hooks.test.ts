/**
 * Unit tests for the column-level customization hooks on `ColumnDef`:
 *   - formatValue
 *   - parseValue
 *   - renderCell
 *   - getCellTitle
 *
 * The hooks are wired through `GridBody` / `GridCell` / `Grid` (editor commit +
 * editor seed). Those call sites live inside Solid components which require a
 * DOM and the SolidJS reactive scheduler — not available in the Bun unit
 * runner. End-to-end behavior for those is covered in
 * `tests/e2e/custom-rendering.test.ts`.
 *
 * This file covers the pieces that CAN run headless:
 *   - `defaultFormatCellValue` behavior (shared between rendering + search)
 *   - `commitCellEdit` respects the identity short-circuit when a hypothetical
 *     `parseValue` returns a `===`-equal value to the previous raw cell
 *   - `commitCellEdit` writes a new value through when `parseValue` returns a
 *     different wrapper
 */
import { describe, expect, it } from "bun:test";
import type { CellValue, ColumnDef } from "../types";
import { createSheetStore } from "./state";
import { commitCellEdit } from "./commands";
import { defaultFormatCellValue } from "./formatting";

function makeColumns(count: number): ColumnDef[] {
	return Array.from({ length: count }, (_, i) => ({
		id: `col${i}`,
		header: `Col ${i}`,
		editable: true,
	}));
}

describe("defaultFormatCellValue", () => {
	it("renders null/undefined as an empty string", () => {
		expect(defaultFormatCellValue(null)).toBe("");
		expect(defaultFormatCellValue(undefined as unknown as CellValue)).toBe("");
	});

	it("renders booleans in uppercase (spreadsheet convention)", () => {
		expect(defaultFormatCellValue(true)).toBe("TRUE");
		expect(defaultFormatCellValue(false)).toBe("FALSE");
	});

	it("stringifies numbers and strings directly", () => {
		expect(defaultFormatCellValue(42)).toBe("42");
		expect(defaultFormatCellValue(0)).toBe("0");
		expect(defaultFormatCellValue("hello")).toBe("hello");
		expect(defaultFormatCellValue("")).toBe("");
	});
});

describe("commitCellEdit identity short-circuit with parseValue-like values", () => {
	it("does not create a mutation when the new value equals the previous value", () => {
		const columns = makeColumns(2);
		const raw = 'NSLOCTEXT("menu","btn.save","Save")';
		const store = createSheetStore([[raw, null]], columns);

		// Simulate an idempotent parseValue returning exactly the same string.
		// commitCellEdit reads oldValue fresh from the store → === check kicks in.
		const mutation = commitCellEdit(store, 0, 0, raw, columns);

		expect(mutation).toBeNull();
		expect(store.cells[0]?.[0]).toBe(raw);
	});

	it("writes when parseValue returns a re-wrapped raw value with different inner text", () => {
		const columns = makeColumns(2);
		const oldRaw = 'NSLOCTEXT("menu","btn.save","Save")';
		const newRaw = 'NSLOCTEXT("menu","btn.save","Save As")';
		const store = createSheetStore([[oldRaw, null]], columns);

		const mutation = commitCellEdit(store, 0, 0, newRaw, columns);

		expect(mutation).not.toBeNull();
		expect(mutation!.oldValue).toBe(oldRaw);
		expect(mutation!.newValue).toBe(newRaw);
		expect(store.cells[0]?.[0]).toBe(newRaw);
	});

	it("sources previousValue from the store, not from stale cached state", () => {
		// Mirrors the real commit path: `commitCellEdit` reads
		// `store.cells[row]?.[col] ?? null` as oldValue — so after a prior write,
		// the "previous value" our parseValue would see is the most recent one.
		const columns = makeColumns(1);
		const store = createSheetStore([["original"]], columns);

		commitCellEdit(store, 0, 0, "updated-1", columns);
		expect(store.cells[0]?.[0]).toBe("updated-1");

		const mutation = commitCellEdit(store, 0, 0, "updated-2", columns);
		expect(mutation!.oldValue).toBe("updated-1");
		expect(store.cells[0]?.[0]).toBe("updated-2");
	});
});

describe("ColumnDef shape (type-level)", () => {
	it("accepts all four optional hooks without type errors", () => {
		// This test is effectively a compile-time assertion. If the
		// ColumnDef interface loses any of the four hooks, TypeScript will
		// fail the project-wide typecheck before this test even runs.
		const col: ColumnDef = {
			id: "loc",
			header: "Localized",
			formatValue: (raw) => (typeof raw === "string" ? raw.toUpperCase() : ""),
			parseValue: (text, { previousValue }) =>
				previousValue === null ? text : `${text}`,
			getCellTitle: (raw) => (raw == null ? undefined : String(raw)),
			renderCell: ({ formattedText }) => formattedText as unknown as never,
		};
		expect(col.formatValue).toBeDefined();
		expect(col.parseValue).toBeDefined();
		expect(col.getCellTitle).toBeDefined();
		expect(col.renderCell).toBeDefined();
	});

	it("supports getCellTitle returning undefined / empty-string / string", () => {
		const col: ColumnDef = {
			id: "t",
			header: "T",
			getCellTitle: (raw) => {
				if (raw === null) return undefined;
				if (raw === 0) return "";
				return String(raw);
			},
		};
		expect(col.getCellTitle!(null, { row: 0, col: 0 })).toBeUndefined();
		expect(col.getCellTitle!(0, { row: 0, col: 0 })).toBe("");
		expect(col.getCellTitle!("hi", { row: 0, col: 0 })).toBe("hi");
	});
});
