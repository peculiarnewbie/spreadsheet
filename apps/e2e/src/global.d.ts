import type { CellMutation, CellValue, SheetController, WorkbookStructuralChange } from "peculiar-sheets";

declare global {
	interface Window {
		/** Current cell data — updated reactively by the test harness. */
		__SHEET_DATA__: CellValue[][];
		/** Accumulated mutations from onCellEdit / onBatchEdit callbacks. */
		__MUTATIONS__: CellMutation[];
		/** Imperative sheet controller for programmatic access. */
		__SHEET_CONTROLLER__: SheetController | null;
		/** Workbook route state by sheet key. */
		__WORKBOOK_DATA__: Record<string, CellValue[][]>;
		/** Workbook route controllers by sheet key. */
		__WORKBOOK_CONTROLLERS__: Record<string, SheetController | null>;
		/** Workbook structural changes emitted by the coordinator. */
		__WORKBOOK_CHANGES__: WorkbookStructuralChange[];
	}
}
