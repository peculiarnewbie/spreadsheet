import type { CellMutation, CellValue, Selection } from "../types";

// ── Row Operation Types ─────────────────────────────────────────────────────

export type RowOperation =
	| { type: "insertRows"; atIndex: number; count: number }
	| { type: "deleteRows"; atIndex: number; count: number; removedData: CellValue[][] };

// ── Types ────────────────────────────────────────────────────────────────────

export interface HistoryEntry {
	forward: CellMutation[];
	inverse: CellMutation[];
	selectionBefore: Selection;
	selectionAfter: Selection;
	/** Optional structural row operation recorded with this entry. */
	rowOp?: RowOperation;
}

export interface HistoryStack {
	undoStack: HistoryEntry[];
	redoStack: HistoryEntry[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_HISTORY = 200;

// ── Factory ──────────────────────────────────────────────────────────────────

export function createHistory(): HistoryStack {
	return { undoStack: [], redoStack: [] };
}

// ── Push ─────────────────────────────────────────────────────────────────────

/**
 * Record a batch of mutations into the history stack.
 * Returns a new HistoryStack (immutable).
 */
export function pushHistory(
	history: HistoryStack,
	forward: CellMutation[],
	selectionBefore: Selection,
	selectionAfter: Selection,
	rowOp?: RowOperation,
): HistoryStack {
	if (forward.length === 0 && !rowOp) return history;

	const inverse = forward.map<CellMutation>((m) => ({
		address: m.address,
		columnId: m.columnId,
		oldValue: m.newValue,
		newValue: m.oldValue,
		source: m.source,
	}));

	const entry: HistoryEntry = { forward, inverse, selectionBefore, selectionAfter, rowOp };

	const undoStack = [...history.undoStack, entry].slice(-MAX_HISTORY);
	return { undoStack, redoStack: [] };
}

// ── Undo / Redo ──────────────────────────────────────────────────────────────

/** Info about what structural row change was performed during undo/redo. */
export interface UndoRedoRowChange {
	type: "insertRows" | "deleteRows";
	atIndex: number;
	count: number;
}

export interface UndoResult {
	history: HistoryStack;
	mutations: CellMutation[];
	selection: Selection;
	/** Describes the inverse row operation that should be applied. */
	rowOp?: RowOperation;
	/** Summarises the structural change for external callbacks. */
	rowChange?: UndoRedoRowChange;
}

export function undo(history: HistoryStack): UndoResult | null {
	if (history.undoStack.length === 0) return null;

	const entry = history.undoStack[history.undoStack.length - 1]!;

	// Compute the inverse row operation and the external-facing change description
	let inverseRowOp: RowOperation | undefined;
	let rowChange: UndoRedoRowChange | undefined;
	if (entry.rowOp) {
		if (entry.rowOp.type === "insertRows") {
			// Undo insert → delete those rows
			inverseRowOp = {
				type: "deleteRows",
				atIndex: entry.rowOp.atIndex,
				count: entry.rowOp.count,
				removedData: [], // rows were empty when inserted
			};
			rowChange = { type: "deleteRows", atIndex: entry.rowOp.atIndex, count: entry.rowOp.count };
		} else {
			// Undo delete → re-insert the rows (with data)
			inverseRowOp = {
				type: "insertRows",
				atIndex: entry.rowOp.atIndex,
				count: entry.rowOp.count,
			};
			rowChange = { type: "insertRows", atIndex: entry.rowOp.atIndex, count: entry.rowOp.count };
		}
	}

	return {
		history: {
			undoStack: history.undoStack.slice(0, -1),
			redoStack: [...history.redoStack, entry],
		},
		mutations: entry.inverse,
		selection: entry.selectionBefore,
		rowOp: inverseRowOp,
		rowChange,
	};
}

export function redo(history: HistoryStack): UndoResult | null {
	if (history.redoStack.length === 0) return null;

	const entry = history.redoStack[history.redoStack.length - 1]!;

	// The forward row operation and its external-facing change description
	let rowChange: UndoRedoRowChange | undefined;
	if (entry.rowOp) {
		if (entry.rowOp.type === "insertRows") {
			rowChange = { type: "insertRows", atIndex: entry.rowOp.atIndex, count: entry.rowOp.count };
		} else {
			rowChange = { type: "deleteRows", atIndex: entry.rowOp.atIndex, count: entry.rowOp.count };
		}
	}

	return {
		history: {
			undoStack: [...history.undoStack, entry],
			redoStack: history.redoStack.slice(0, -1),
		},
		mutations: entry.forward,
		selection: entry.selectionAfter,
		rowOp: entry.rowOp,
		rowChange,
	};
}

export function canUndo(history: HistoryStack): boolean {
	return history.undoStack.length > 0;
}

export function canRedo(history: HistoryStack): boolean {
	return history.redoStack.length > 0;
}
