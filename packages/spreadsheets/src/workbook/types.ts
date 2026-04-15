import type { CellRange, CellValue, SheetController } from "../types";

export interface WorkbookCoordinatorOptions {
	engine: unknown;
}

export interface WorkbookSheetDefinition {
	sheetKey: string;
	formulaName: string;
}

export interface WorkbookSheetBinding {
	coordinator: WorkbookCoordinator;
	sheetKey: string;
	formulaName: string;
}

export type WorkbookStructuralOrigin =
	| { type: "insertRows"; sheetKey: string; atIndex: number; count: number }
	| { type: "deleteRows"; sheetKey: string; atIndex: number; count: number }
	| { type: "setRowOrder"; sheetKey: string; indexOrder: number[] }
	| { type: "undo" }
	| { type: "redo" };

export interface WorkbookStructuralChange {
	origin: WorkbookStructuralOrigin;
	snapshots: Array<{
		sheetKey: string;
		cells: CellValue[][];
	}>;
}

export interface WorkbookCoordinator {
	bindSheet(definition: WorkbookSheetDefinition): WorkbookSheetBinding;
	subscribe(listener: (change: WorkbookStructuralChange) => void): () => void;

	getController(sheetKey: string): SheetController | null;

	insertReference(sourceSheetKey: string, targetSheetKey: string, range: CellRange): boolean;
	setReferenceHighlight(sheetKey: string, range: CellRange | null): void;
	clearReferenceHighlights(): void;

	insertRows(sheetKey: string, atIndex: number, count: number): WorkbookStructuralChange | null;
	deleteRows(sheetKey: string, atIndex: number, count: number): WorkbookStructuralChange | null;
	setRowOrder(sheetKey: string, indexOrder: number[]): WorkbookStructuralChange | null;

	undo(): WorkbookStructuralChange | null;
	redo(): WorkbookStructuralChange | null;
	canUndo(): boolean;
	canRedo(): boolean;
}
