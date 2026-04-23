export { Sheet } from "./Sheet";
export { createWorkbookCoordinator } from "./workbook/coordinator";
export { addressToA1, isFormulaValue, rangeToA1, shiftFormulaByDelta } from "./formula/references";
export { createRangeStyles } from "./rangeStyles";
export { Result, isApplied, isNoop } from "./internal/result";
export {
	DEFAULT_COL_WIDTH,
	DEFAULT_ROW_HEIGHT,
	HEADER_HEIGHT,
} from "./types";

export type {
	CellAddress,
	CellContext,
	CellMutation,
	CellRange,
	CellRenderContext,
	CellStyle,
	CellValue,
	ClipboardPayload,
	ColumnDef,
	EditModeState,
	FormulaEngineConfig,
	ParseValueContext,
	RowReorderMutation,
	ResizeMode,
	ResizeSessionState,
	ScrollPosition,
	Selection,
	SheetController,
	SheetCustomization,
	SheetSizingState,
	SheetProps,
	SortBehavior,
	SortDirection,
	SortState,
} from "./types";

export type { RangeStyleRule, StyleTarget } from "./rangeStyles";
export type {
	AppliedOutcome,
	NoopOutcome,
	OperationOutcome,
	ResultLike,
} from "./internal/result";
export type { WorkbookCoordinatorError } from "./internal/errors";

export type {
	WorkbookCoordinator,
	WorkbookCoordinatorOptions,
	WorkbookHistoryNoopReason,
	WorkbookHistoryResult,
	WorkbookReferenceNoopReason,
	WorkbookReferenceResult,
	WorkbookSheetBinding,
	WorkbookSheetDefinition,
	WorkbookStructuralNoopReason,
	WorkbookStructuralChange,
	WorkbookStructuralOrigin,
	WorkbookStructuralResult,
} from "./workbook/types";
