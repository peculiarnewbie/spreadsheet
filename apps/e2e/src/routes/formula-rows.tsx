import HyperFormula from "hyperformula";
import type { ColumnDef, CellValue } from "peculiar-sheets";
import Harness from "../harness";

/**
 * E2E test page for formula + row-insert + autofill interaction.
 *
 * Mirrors the website HeroSheet layout:
 *   Row 0: Engineering  48  52  =B1+C1  (→100)
 *   Row 1: Design       32  35  =B2+C2  (→67)
 *   Row 2: Marketing    28  31  =B3+C3  (→59)
 *   Row 3: (null)       —   Sum =SUM(D1:D3)  (→226)
 *   Rows 4-7: empty (fill targets)
 */

const columns: ColumnDef[] = [
	{ id: "team", header: "Team", width: 120, editable: true },
	{ id: "q1", header: "Q1", width: 85, editable: true },
	{ id: "q2", header: "Q2", width: 85, editable: true },
	{ id: "total", header: "Total", width: 95, editable: true },
];

const data: CellValue[][] = [
	["Engineering", 48, 52, "=B1+C1"],
	["Design", 32, 35, "=B2+C2"],
	["Marketing", 28, 31, "=B3+C3"],
	[null, null, "Sum", "=SUM(D1:D3)"],
	[null, null, null, null],
	[null, null, null, null],
	[null, null, null, null],
	[null, null, null, null],
];

const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });
const sheetName = hf.addSheet("FormulaRows");
const sheetId = hf.getSheetId(sheetName)!;

export default function FormulaRowsPage() {
	return (
		<Harness
			initialData={data}
			columns={columns}
			formulaEngine={{ instance: hf, sheetId, sheetName }}
			showFormulaBar
			showReferenceHeaders
		/>
	);
}
