import type { CellAddress, CellValue } from "../types";
import { defaultFormatCellValue } from "./formatting";

// ── Search Logic ────────────────────────────────────────────────────────────

/**
 * Scans all cells in the grid and returns addresses of cells whose display
 * value contains the query string (case-insensitive). Results are in
 * row-major order (sorted by row, then column).
 */
export function findMatches(
	getDisplayValue: (row: number, col: number) => CellValue,
	rowCount: number,
	colCount: number,
	query: string,
): CellAddress[] {
	if (!query) return [];

	const lowerQuery = query.toLowerCase();
	const matches: CellAddress[] = [];

	for (let row = 0; row < rowCount; row++) {
		for (let col = 0; col < colCount; col++) {
			const display = defaultFormatCellValue(getDisplayValue(row, col));
			if (display.toLowerCase().includes(lowerQuery)) {
				matches.push({ row, col });
			}
		}
	}

	return matches;
}

function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame === "function") {
			requestAnimationFrame(() => resolve());
			return;
		}
		setTimeout(resolve, 0);
	});
}

export async function findMatchesChunked(
	getDisplayValue: (row: number, col: number) => CellValue,
	rowCount: number,
	colCount: number,
	query: string,
	options?: {
		chunkSize?: number;
		isCancelled?: () => boolean;
	},
): Promise<CellAddress[]> {
	if (!query) return [];

	const lowerQuery = query.toLowerCase();
	const matches: CellAddress[] = [];
	const chunkSize = options?.chunkSize ?? 2_000;
	let scannedInChunk = 0;

	for (let row = 0; row < rowCount; row++) {
		for (let col = 0; col < colCount; col++) {
			if (options?.isCancelled?.()) return [];

			const display = defaultFormatCellValue(getDisplayValue(row, col));
			if (display.toLowerCase().includes(lowerQuery)) {
				matches.push({ row, col });
			}

			scannedInChunk += 1;
			if (scannedInChunk >= chunkSize) {
				scannedInChunk = 0;
				await yieldToBrowser();
			}
		}
	}

	return matches;
}

/**
 * Converts an array of CellAddress matches into a Set of "row,col" keys
 * for O(1) membership testing when rendering cells.
 */
export function createMatchSet(matches: CellAddress[]): Set<string> {
	const set = new Set<string>();
	for (const addr of matches) {
		set.add(`${addr.row},${addr.col}`);
	}
	return set;
}
