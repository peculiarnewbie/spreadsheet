import type { CellValue } from "../types";

const CELL_VALUE_TYPES = new Set(["string", "number", "boolean"]);

export function isCellValue(value: unknown): value is CellValue {
	if (value === null) return true;
	return CELL_VALUE_TYPES.has(typeof value);
}

export function normalizeCellValue(value: unknown): CellValue {
	if (isCellValue(value)) return value;
	return null;
}

function isCellRow(value: unknown): value is CellValue[] {
	if (!Array.isArray(value)) return false;
	return value.every(isCellValue);
}

export function isCellMatrix(value: unknown): value is CellValue[][] {
	if (!Array.isArray(value)) return false;
	return value.length === 0 || value.every(isCellRow);
}

export function normalizeCellMatrix(value: unknown): CellValue[][] {
	if (!Array.isArray(value)) return [];
	return value
		.filter(isCellRow)
		.map((row) => (row as CellValue[]).map(normalizeCellValue));
}
