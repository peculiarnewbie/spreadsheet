export type Brand<T, B extends string> = T & { readonly __brand__: B };

export type PhysicalRowIndex = Brand<number, "PhysicalRowIndex">;
export type VisualRowIndex = Brand<number, "VisualRowIndex">;
export type ColumnIndex = Brand<number, "ColumnIndex">;
export type RowId = Brand<number, "RowId">;
export type FormulaSheetId = Brand<number, "FormulaSheetId">;

export const physicalRow = (n: number): PhysicalRowIndex => n as PhysicalRowIndex;
export const visualRow = (n: number): VisualRowIndex => n as VisualRowIndex;
export const columnIdx = (n: number): ColumnIndex => n as ColumnIndex;
export const rowId = (n: number): RowId => n as RowId;
export const formulaSheetId = (n: number): FormulaSheetId => n as FormulaSheetId;

export const toNumber = (b: number): number => b;