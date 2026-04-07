import { createEffect, createSignal, on } from "solid-js";
import { createStore, produce } from "solid-js/store";
import type {
	CellMutation,
	CellValue,
	ColumnDef,
	EditModeState,
	Selection,
} from "../types";
import { emptySelection, selectCell } from "./selection";
import {
	type HistoryStack,
	type RowOperation,
	type UndoRedoRowChange,
	canRedo as histCanRedo,
	canUndo as histCanUndo,
	createHistory,
	pushHistory,
	redo as histRedo,
	undo as histUndo,
} from "./history";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SheetState {
	cells: CellValue[][];
	rowCount: number;
	colCount: number;
}

export interface UndoRedoResult {
	mutations: CellMutation[];
	rowChange?: UndoRedoRowChange;
}

export interface SheetStore {
	// Reactive state accessors
	cells: CellValue[][];
	rowCount(): number;
	colCount(): number;
	selection(): Selection;
	editMode(): EditModeState | null;
	columnWidths(): Map<string, number>;
	history(): HistoryStack;

	// Mutations
	setCell(row: number, col: number, value: CellValue): void;
	setCells(mutations: Array<{ row: number; col: number; value: CellValue }>): void;
	setSelection(selection: Selection): void;
	setEditMode(state: EditModeState | null): void;
	setColumnWidth(columnId: string, width: number): void;
	resizeGrid(rowCount: number, colCount: number): void;
	insertRows(atIndex: number, count: number): void;
	deleteRows(atIndex: number, count: number): CellValue[][];

	// History
	pushMutations(mutations: CellMutation[], selectionBefore: Selection, selectionAfter: Selection): void;
	pushRowOperation(rowOp: RowOperation, selectionBefore: Selection, selectionAfter: Selection): void;
	undo(): UndoRedoResult | null;
	redo(): UndoRedoResult | null;
	canUndo(): boolean;
	canRedo(): boolean;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSheetStore(
	initialData: CellValue[][],
	columns: ColumnDef[],
): SheetStore {
	const rowCount = initialData.length;
	const colCount = columns.length;

	// Deep copy initial data to avoid shared references
	const initialCells = initialData.map((row) => [...row]);

	const [cells, setCells] = createStore<CellValue[][]>(initialCells);
	const [dimensions, setDimensions] = createSignal({ rowCount, colCount });
	const [selection, setSelection] = createSignal<Selection>(
		rowCount > 0 && colCount > 0 ? selectCell({ row: 0, col: 0 }) : emptySelection(),
	);
	const [editMode, setEditMode] = createSignal<EditModeState | null>(null);
	const [colWidths, setColWidths] = createSignal<Map<string, number>>(
		new Map(columns.map((c) => [c.id, c.width ?? 120])),
	);
	const [historyState, setHistory] = createSignal<HistoryStack>(createHistory());

	/** Internal: splice empty rows into the cells array and update dimensions. */
	function _insertRows(atIndex: number, count: number) {
		const currentRowCount = dimensions().rowCount;
		const cc = dimensions().colCount;
		const insertAt = Math.max(0, Math.min(atIndex, currentRowCount));

		setDimensions({ rowCount: currentRowCount + count, colCount: cc });
		setCells(
			produce((draft) => {
				const newRows = Array.from({ length: count }, () =>
					new Array(cc).fill(null) as CellValue[],
				);
				draft.splice(insertAt, 0, ...newRows);
			}),
		);
	}

	/** Internal: splice rows out of the cells array, update dimensions, return removed data. */
	function _deleteRows(atIndex: number, count: number): CellValue[][] {
		const currentRowCount = dimensions().rowCount;
		const cc = dimensions().colCount;
		const deleteAt = Math.max(0, Math.min(atIndex, currentRowCount));
		const actualCount = Math.min(count, currentRowCount - deleteAt);
		if (actualCount <= 0) return [];

		// Capture the data being removed (deep copy)
		const removedData: CellValue[][] = [];
		for (let r = deleteAt; r < deleteAt + actualCount; r++) {
			const row = cells[r];
			removedData.push(row ? [...row] : new Array(cc).fill(null) as CellValue[]);
		}

		setDimensions({ rowCount: currentRowCount - actualCount, colCount: cc });
		setCells(
			produce((draft) => {
				draft.splice(deleteAt, actualCount);
			}),
		);

		return removedData;
	}

	/** Internal: insert rows and fill them with given data. */
	function _insertRowsWithData(atIndex: number, data: CellValue[][]) {
		_insertRows(atIndex, data.length);
		// Restore the saved cell data
		setCells(
			produce((draft) => {
				for (let r = 0; r < data.length; r++) {
					const row = data[r]!;
					const targetRow = draft[atIndex + r]!;
					for (let c = 0; c < row.length; c++) {
						targetRow[c] = row[c] ?? null;
					}
				}
			}),
		);
	}

	/** Internal: apply a row operation (used during undo/redo). */
	function applyRowOp(rowOp: RowOperation) {
		if (rowOp.type === "insertRows") {
			_insertRows(rowOp.atIndex, rowOp.count);
		} else {
			_deleteRows(rowOp.atIndex, rowOp.count);
		}
	}

	return {
		get cells() {
			return cells;
		},

		rowCount: () => dimensions().rowCount,
		colCount: () => dimensions().colCount,

		selection,
		editMode,
		columnWidths: colWidths,
		history: historyState,

		setCell(row: number, col: number, value: CellValue) {
			setCells(
				produce((draft) => {
					// Ensure row exists
					while (draft.length <= row) {
						draft.push(new Array(dimensions().colCount).fill(null) as CellValue[]);
					}
					const draftRow = draft[row]!;
					// Ensure column exists
					while (draftRow.length <= col) {
						draftRow.push(null);
					}
					draftRow[col] = value;
				}),
			);
		},

		setCells(mutations: Array<{ row: number; col: number; value: CellValue }>) {
			setCells(
				produce((draft) => {
					for (const m of mutations) {
						while (draft.length <= m.row) {
							draft.push(new Array(dimensions().colCount).fill(null) as CellValue[]);
						}
						const draftRow = draft[m.row]!;
						while (draftRow.length <= m.col) {
							draftRow.push(null);
						}
						draftRow[m.col] = m.value;
					}
				}),
			);
		},

		setSelection,
		setEditMode,

		setColumnWidth(columnId: string, width: number) {
			setColWidths((prev) => {
				const next = new Map(prev);
				next.set(columnId, width);
				return next;
			});
		},

		resizeGrid(newRowCount: number, newColCount: number) {
			setDimensions({ rowCount: newRowCount, colCount: newColCount });
			setCells(
				produce((draft) => {
					// Add rows if needed
					while (draft.length < newRowCount) {
						draft.push(new Array(newColCount).fill(null) as CellValue[]);
					}
					// Trim excess rows
					if (draft.length > newRowCount) {
						draft.length = newRowCount;
					}
					// Ensure each row has the right number of columns
					for (let i = 0; i < draft.length; i++) {
						const row = draft[i]!;
						while (row.length < newColCount) {
							row.push(null);
						}
					}
				}),
			);
		},

		insertRows(atIndex: number, count: number) {
			_insertRows(atIndex, count);
		},

		deleteRows(atIndex: number, count: number): CellValue[][] {
			return _deleteRows(atIndex, count);
		},

		pushMutations(mutations: CellMutation[], selectionBefore: Selection, selectionAfter: Selection) {
			setHistory((prev) => pushHistory(prev, mutations, selectionBefore, selectionAfter));
		},

		pushRowOperation(rowOp: RowOperation, selectionBefore: Selection, selectionAfter: Selection) {
			setHistory((prev) => pushHistory(prev, [], selectionBefore, selectionAfter, rowOp));
		},

		undo(): UndoRedoResult | null {
			const result = histUndo(historyState());
			if (!result) return null;
			setHistory(result.history);
			setSelection(result.selection);

			// Apply structural row change first (if any)
			if (result.rowOp) {
				if (result.rowOp.type === "insertRows") {
					// Undo of deleteRows → re-insert with saved data
					const originalEntry = historyState().redoStack[historyState().redoStack.length - 1];
					const originalRowOp = originalEntry?.rowOp;
					if (originalRowOp?.type === "deleteRows" && originalRowOp.removedData.length > 0) {
						_insertRowsWithData(result.rowOp.atIndex, originalRowOp.removedData);
					} else {
						applyRowOp(result.rowOp);
					}
				} else {
					applyRowOp(result.rowOp);
				}
			}

			// Apply inverse cell mutations
			if (result.mutations.length > 0) {
				setCells(
					produce((draft) => {
						for (const m of result.mutations) {
							const row = draft[m.address.row];
							if (row) {
								row[m.address.col] = m.newValue;
							}
						}
					}),
				);
			}

			return { mutations: result.mutations, rowChange: result.rowChange };
		},

		redo(): UndoRedoResult | null {
			const result = histRedo(historyState());
			if (!result) return null;
			setHistory(result.history);
			setSelection(result.selection);

			// Apply structural row change first (if any)
			if (result.rowOp) {
				applyRowOp(result.rowOp);
			}

			// Apply forward cell mutations
			if (result.mutations.length > 0) {
				setCells(
					produce((draft) => {
						for (const m of result.mutations) {
							const row = draft[m.address.row];
							if (row) {
								row[m.address.col] = m.newValue;
							}
						}
					}),
				);
			}

			return { mutations: result.mutations, rowChange: result.rowChange };
		},

		canUndo: () => histCanUndo(historyState()),
		canRedo: () => histCanRedo(historyState()),
	};
}

// ── Reconciliation ───────────────────────────────────────────────────────────

/**
 * Sets up a reactive effect that reconciles external data changes into the
 * store. Host data is authoritative — overwrites internal values.
 */
export function createReconciler(
	store: SheetStore,
	getData: () => CellValue[][],
	getColumns: () => ColumnDef[],
): void {
	createEffect(
		on(
			[getData, getColumns],
			([data, columns]) => {
				const newRowCount = data.length;
				const newColCount = columns.length;

				// Resize grid if dimensions changed
				if (newRowCount !== store.rowCount() || newColCount !== store.colCount()) {
					store.resizeGrid(newRowCount, newColCount);
				}

				// Update column widths for new columns
				for (const col of columns) {
					if (!store.columnWidths().has(col.id)) {
						store.setColumnWidth(col.id, col.width ?? 120);
					}
				}

				// Reconcile cell data — host values overwrite internal state
				const mutations: Array<{ row: number; col: number; value: CellValue }> = [];
				for (let r = 0; r < data.length; r++) {
					const dataRow = data[r];
					if (!dataRow) continue;
					for (let c = 0; c < dataRow.length; c++) {
						const externalValue = dataRow[c] ?? null;
						const internalValue = store.cells[r]?.[c] ?? null;
						if (externalValue !== internalValue) {
							mutations.push({ row: r, col: c, value: externalValue });
						}
					}
				}

				if (mutations.length > 0) {
					store.setCells(mutations);
				}
			},
		),
	);
}
