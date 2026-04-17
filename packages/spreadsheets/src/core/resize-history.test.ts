import { describe, expect, it } from "bun:test";
import type { ColumnDef } from "../types";
import { createSheetStore } from "./state";
import { selectCell } from "./selection";

const columns: ColumnDef[] = [
	{ id: "a", header: "A", width: 120 },
];

describe("resize history in sheet store", () => {
	it("undoes and redoes committed column widths", () => {
		const store = createSheetStore([[1]], columns);
		const selection = selectCell({ row: 0, col: 0 });

		store.setColumnWidth("a", 180);
		store.pushColumnResize(
			{ columnId: "a", oldWidth: 120, newWidth: 180 },
			selection,
			selection,
		);

		const undoResult = store.undo();
		expect(undoResult?.columnResize).toEqual({ columnId: "a", width: 120 });
		expect(store.columnWidths().get("a")).toBe(120);

		const redoResult = store.redo();
		expect(redoResult?.columnResize).toEqual({ columnId: "a", width: 180 });
		expect(store.columnWidths().get("a")).toBe(180);
	});

	it("undoes and redoes committed row heights", () => {
		const store = createSheetStore([[1]], columns);
		const selection = selectCell({ row: 0, col: 0 });
		const rowId = store.getRowIdAtPhysicalRow(0)!;

		store.setRowHeight(rowId, 52);
		store.pushRowResize(
			{ rowId, oldHeight: 28, newHeight: 52 },
			selection,
			selection,
		);

		const undoResult = store.undo();
		expect(undoResult?.rowResize).toEqual({ rowId, height: 28 });
		expect(store.rowHeights().get(rowId)).toBe(28);

		const redoResult = store.redo();
		expect(redoResult?.rowResize).toEqual({ rowId, height: 52 });
		expect(store.rowHeights().get(rowId)).toBe(52);
	});
});
