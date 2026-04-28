import type { CellRange, Selection, VisualCellAddress } from "../types";
import { visualRow, columnIdx } from "./brands";

// ── Factories ────────────────────────────────────────────────────────────────

export function emptySelection(): Selection {
	return {
		ranges: [],
		anchor: { row: visualRow(0), col: columnIdx(0) },
		focus: { row: visualRow(0), col: columnIdx(0) },
		editing: null,
	};
}

export function selectCell(addr: VisualCellAddress): Selection {
	const range: CellRange = { start: addr, end: addr };
	return {
		ranges: [range],
		anchor: addr,
		focus: addr,
		editing: null,
	};
}

export function extendSelection(anchor: VisualCellAddress, focus: VisualCellAddress): Selection {
	const range = normalizeRange({ start: anchor, end: focus });
	return {
		ranges: [range],
		anchor,
		focus,
		editing: null,
	};
}

export function addRange(current: Selection, newRange: CellRange): Selection {
	return {
		ranges: [...current.ranges, normalizeRange(newRange)],
		anchor: newRange.start,
		focus: newRange.end,
		editing: null,
	};
}

export function selectAll(rowCount: number, colCount: number): Selection {
	if (rowCount === 0 || colCount === 0) return emptySelection();
	const range: CellRange = {
		start: { row: visualRow(0), col: columnIdx(0) },
		end: { row: visualRow(rowCount - 1), col: columnIdx(colCount - 1) },
	};
	return {
		ranges: [range],
		anchor: { row: visualRow(0), col: columnIdx(0) },
		focus: { row: visualRow(rowCount - 1), col: columnIdx(colCount - 1) },
		editing: null,
	};
}

// ── Navigation ───────────────────────────────────────────────────────────────

export type Direction = "up" | "down" | "left" | "right";

interface Bounds {
	rowCount: number;
	colCount: number;
}

export function moveSelection(
	current: Selection,
	direction: Direction,
	shift: boolean,
	_ctrl: boolean,
	bounds: Bounds,
): Selection {
	const focus = shift ? current.focus : current.anchor;
	const next = moveAddress(focus, direction, bounds);

	if (shift) {
		return extendSelection(current.anchor, next);
	}
	return selectCell(next);
}

function moveAddress(addr: VisualCellAddress, direction: Direction, bounds: Bounds): VisualCellAddress {
	switch (direction) {
		case "up":
			return { row: visualRow(Math.max(0, addr.row - 1)), col: addr.col };
		case "down":
			return { row: visualRow(Math.min(bounds.rowCount - 1, addr.row + 1)), col: addr.col };
		case "left":
			return { row: addr.row, col: columnIdx(Math.max(0, addr.col - 1)) };
		case "right":
			return { row: addr.row, col: columnIdx(Math.min(bounds.colCount - 1, addr.col + 1)) };
	}
}

// ── Hit Testing ──────────────────────────────────────────────────────────────

export function selectionContains(selection: Selection, addr: VisualCellAddress): boolean {
	return selection.ranges.some((range) => rangeContains(range, addr));
}

export function rangeContains(range: CellRange, addr: VisualCellAddress): boolean {
	const nr = normalizeRange(range);
	return (
		addr.row >= nr.start.row &&
		addr.row <= nr.end.row &&
		addr.col >= nr.start.col &&
		addr.col <= nr.end.col
	);
}

export function isSingleCell(selection: Selection): boolean {
	return (
		selection.ranges.length === 1 &&
		addressEquals(selection.ranges[0]!.start, selection.ranges[0]!.end)
	);
}

// ── Range Utilities ──────────────────────────────────────────────────────────

export function normalizeRange(range: CellRange): CellRange {
	return {
		start: {
			row: visualRow(Math.min(range.start.row, range.end.row)),
			col: columnIdx(Math.min(range.start.col, range.end.col)),
		},
		end: {
			row: visualRow(Math.max(range.start.row, range.end.row)),
			col: columnIdx(Math.max(range.start.col, range.end.col)),
		},
	};
}

export function* iterateRange(range: CellRange): Generator<VisualCellAddress> {
	const nr = normalizeRange(range);
	for (let r = nr.start.row; r <= nr.end.row; r++) {
		for (let c = nr.start.col; c <= nr.end.col; c++) {
			yield { row: visualRow(r), col: columnIdx(c) };
		}
	}
}

export function addressEquals(a: VisualCellAddress, b: VisualCellAddress): boolean {
	return a.row === b.row && a.col === b.col;
}

/** Returns the primary selected range (first range) or null if no selection. */
export function primaryRange(selection: Selection): CellRange | null {
	return selection.ranges[0] ?? null;
}
