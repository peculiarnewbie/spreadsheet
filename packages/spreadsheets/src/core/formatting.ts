import type { CellValue } from "../types";

/**
 * Default stringifier for a CellValue as shown in a grid cell.
 * - `null` / `undefined` → empty string
 * - booleans → `"TRUE"` / `"FALSE"` (spreadsheet convention)
 * - everything else → `String(value)`
 *
 * Shared between cell rendering and search so both agree on "display text"
 * when no column-level `formatValue` override is provided.
 */
export function defaultFormatCellValue(value: CellValue): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	return String(value);
}
