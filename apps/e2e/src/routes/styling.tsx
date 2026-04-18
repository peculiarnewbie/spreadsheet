import { createRangeStyles, type CellValue, type ColumnDef } from "peculiar-sheets";
import Harness from "../harness";

// ── Grid shape ────────────────────────────────────────────────
// 6 columns × 8 rows. Row 0 is treated as a visual header so we
// can assert header-style rules against it.

const columns: ColumnDef[] = [
	{ id: "c0", header: "A", width: 80, editable: true },
	{ id: "c1", header: "B", width: 80, editable: true },
	{ id: "c2", header: "C", width: 80, editable: true },
	{ id: "c3", header: "D", width: 80, editable: true },
	{ id: "c4", header: "E", width: 80, editable: true },
	{ id: "c5", header: "F", width: 80, editable: true },
];

const data: CellValue[][] = [
	["H0", "H1", "H2", "H3", "H4", "H5"], // row 0 — header
	[1, 2, 3, 4, 5, 6],
	[7, 8, 9, 10, 11, 12], // row 2 — inside cascade block
	[13, 14, 15, 16, 17, 18], // row 3 — highlighted single cell + cascade override
	[19, 20, 21, 22, 23, 24], // row 4 — inside cascade block
	[25, 26, 27, 28, 29, 30], // row 5 — dashed bottom (first range in mixed array)
	[31, 32, 33, 34, 35, 36],
	[37, 38, 39, 40, 41, 42], // row 7 — dashed bottom (second range in mixed array)
];

// ── Style rules ───────────────────────────────────────────────
// Each rule deliberately exercises one facet of the styling API
// so the e2e test can assert behavior independently.

const getCellStyle = createRangeStyles([
	// Rule A — rectangular range covering the header row.
	// Tests: CellRange target + typography + fill color.
	{
		range: { start: { row: 0, col: 0 }, end: { row: 0, col: 5 } },
		style: {
			"background-color": "rgb(31, 41, 55)",
			color: "rgb(255, 255, 255)",
			"font-weight": 600,
		},
	},

	// Rule B — single CellAddress target.
	// Tests: bare CellAddress (no start/end) matches exactly one cell.
	{
		range: { row: 3, col: 2 },
		style: {
			"background-color": "rgb(127, 29, 29)",
			color: "rgb(254, 202, 202)",
		},
	},

	// Rule C — array mixing two non-contiguous ranges under one rule.
	// Tests: StyleTarget[] with multiple CellRange entries.
	{
		range: [
			{ start: { row: 5, col: 0 }, end: { row: 5, col: 5 } },
			{ start: { row: 7, col: 0 }, end: { row: 7, col: 5 } },
		],
		style: { "border-bottom": "2px dashed rgb(74, 222, 128)" },
	},

	// Rule D — block covering rows 2-4, cols 4-5.
	// Paired with Rule E below to test cascade semantics.
	{
		range: { start: { row: 2, col: 4 }, end: { row: 4, col: 5 } },
		style: {
			"background-color": "rgb(30, 58, 138)",
			color: "rgb(191, 219, 254)",
		},
	},

	// Rule E — narrower overlay on row 3 cols 4-5.
	// Tests: later rule shallow-merges over earlier — background-color
	// from Rule D should survive, but `color` here wins.
	{
		range: { start: { row: 3, col: 4 }, end: { row: 3, col: 5 } },
		style: { color: "rgb(250, 204, 21)" },
	},
]);

export default function StylingPage() {
	return <Harness initialData={data} columns={columns} customization={{ getCellStyle }} />;
}
