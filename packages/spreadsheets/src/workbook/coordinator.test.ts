import { describe, expect, it } from "bun:test";
import * as HyperFormulaNS from "hyperformula";
import type { CellRange, CellValue, SheetController } from "../types";
import { createWorkbookCoordinator, getWorkbookCoordinatorInternals } from "./coordinator";

const HyperFormula = HyperFormulaNS.HyperFormula ?? HyperFormulaNS.default;

function createStubController(
	overrides: Partial<SheetController> = {},
): SheetController {
	return {
		getSelection: () => ({
			ranges: [],
			anchor: { row: 0, col: 0 },
			focus: { row: 0, col: 0 },
			editing: null,
		}),
		setSelection: () => {},
		clearSelection: () => {},
		scrollToCell: () => {},
		startEditing: () => {},
		stopEditing: () => {},
		getRawCellValue: () => null,
		getDisplayCellValue: () => null,
		getEditorText: () => null,
		canInsertReference: () => false,
		insertReferenceText: () => {},
		setReferenceHighlight: () => {},
		setActiveEditorValue: () => {},
		commitActiveEditor: () => {},
		cancelActiveEditor: () => {},
		getCellValue: () => null,
		setCellValue: () => {},
		insertRows: () => {},
		deleteRows: () => {},
		getColumnMeta: () => undefined,
		undo: () => {},
		redo: () => {},
		canUndo: () => false,
		canRedo: () => false,
		getCanvasElement: () => null,
		...overrides,
	};
}

describe("workbook coordinator", () => {
	it("binds sheets once and reuses the same sheet ids", () => {
		const coordinator = createWorkbookCoordinator({
			engine: HyperFormula.buildEmpty({ licenseKey: "gpl-v3" }),
		});

		const first = coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });
		const second = coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });
		const internals = getWorkbookCoordinatorInternals(coordinator);

		expect(first.sheetKey).toBe("data");
		expect(second.formulaName).toBe("Data");
		expect(internals.getFormulaEngineConfig(first).sheetId).toBe(
			internals.getFormulaEngineConfig(second).sheetId,
		);
	});

	it("rejects duplicate formula names across different sheet keys", () => {
		const coordinator = createWorkbookCoordinator({
			engine: HyperFormula.buildEmpty({ licenseKey: "gpl-v3" }),
		});

		coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });

		expect(() =>
			coordinator.bindSheet({ sheetKey: "summary", formulaName: "Data" })
		).toThrow(/already used/i);
	});

	it("inserts cross-sheet references through attached controllers", () => {
		const coordinator = createWorkbookCoordinator({
			engine: HyperFormula.buildEmpty({ licenseKey: "gpl-v3" }),
		});
		const data = coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });
		const summary = coordinator.bindSheet({ sheetKey: "summary", formulaName: "Summary" });
		const internals = getWorkbookCoordinatorInternals(coordinator);
		const insertedTexts: string[] = [];
		const highlightedRanges: Array<CellRange | null> = [];

		internals.attachController(summary.sheetKey, createStubController({
			canInsertReference: () => true,
			insertReferenceText: (text) => insertedTexts.push(text),
		}));
		internals.attachController(data.sheetKey, createStubController({
			setReferenceHighlight: (range) => highlightedRanges.push(range),
		}));

		const inserted = coordinator.insertReference(summary.sheetKey, data.sheetKey, {
			start: { row: 0, col: 0 },
			end: { row: 1, col: 0 },
		});

		expect(inserted).toBe(true);
		expect(insertedTexts).toEqual(["Data!A1:A2"]);
		expect(highlightedRanges).toEqual([{
			start: { row: 0, col: 0 },
			end: { row: 1, col: 0 },
		}]);
	});

	it("emits workbook snapshots for insert, delete, and undo/redo", () => {
		const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });
		const coordinator = createWorkbookCoordinator({ engine: hf });
		const data = coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });
		const summary = coordinator.bindSheet({ sheetKey: "summary", formulaName: "Summary" });
		const internals = getWorkbookCoordinatorInternals(coordinator);

		let dataCells: CellValue[][] = [["Alpha", 10], ["Beta", 20], ["Gamma", 30]];
		let summaryCells: CellValue[][] = [["Total", "=SUM(Data!B1:B3)"], ["Mid", "=Data!B2"]];

		internals.attachDataGetter(data.sheetKey, () => dataCells);
		internals.attachDataGetter(summary.sheetKey, () => summaryCells);

		const insertChange = coordinator.insertRows(data.sheetKey, 1, 1)!;
		const insertSummary = insertChange.snapshots.find((entry) => entry.sheetKey === "summary");
		expect(insertSummary?.cells[0]?.[1]).toBe("=SUM(Data!B1:B4)");
		expect(insertSummary?.cells[1]?.[1]).toBe("=Data!B3");

		dataCells = insertChange.snapshots.find((entry) => entry.sheetKey === "data")!.cells;
		summaryCells = insertSummary!.cells;

		const deleteChange = coordinator.deleteRows(data.sheetKey, 1, 1)!;
		const deleteSummary = deleteChange.snapshots.find((entry) => entry.sheetKey === "summary");
		expect(deleteSummary?.cells[0]?.[1]).toBe("=SUM(Data!B1:B3)");
		expect(deleteSummary?.cells[1]?.[1]).toBe("=Data!B2");

		const undoChange = coordinator.undo()!;
		const undoSummary = undoChange.snapshots.find((entry) => entry.sheetKey === "summary");
		expect(undoSummary?.cells[0]?.[1]).toBe("=SUM(Data!B1:B4)");

		const redoChange = coordinator.redo()!;
		const redoSummary = redoChange.snapshots.find((entry) => entry.sheetKey === "summary");
		expect(redoSummary?.cells[0]?.[1]).toBe("=SUM(Data!B1:B3)");
	});

	it("reorders rows through HyperFormula and preserves dependent displays", () => {
		const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });
		const coordinator = createWorkbookCoordinator({ engine: hf });
		const data = coordinator.bindSheet({ sheetKey: "data", formulaName: "Data" });
		const summary = coordinator.bindSheet({ sheetKey: "summary", formulaName: "Summary" });
		const internals = getWorkbookCoordinatorInternals(coordinator);

		const dataCells: CellValue[][] = [["Alpha", 10], ["Beta", 20], ["Gamma", 30]];
		const summaryCells: CellValue[][] = [["First", "=Data!A1"], ["Total", "=SUM(Data!B1:B3)"]];

		internals.attachDataGetter(data.sheetKey, () => dataCells);
		internals.attachDataGetter(summary.sheetKey, () => summaryCells);

		const change = coordinator.setRowOrder(data.sheetKey, [2, 1, 0])!;
		const nextData = change.snapshots.find((entry) => entry.sheetKey === "data")!.cells;
		const nextSummary = change.snapshots.find((entry) => entry.sheetKey === "summary")!.cells;

		expect(nextData[0]?.[0]).toBe("Gamma");
		expect(nextSummary[0]?.[1]).toBe("=Data!A1");
		expect(hf.getSheetValues(internals.getFormulaEngineConfig(summary).sheetId!)[0]?.[1]).toBe("Gamma");
	});
});
