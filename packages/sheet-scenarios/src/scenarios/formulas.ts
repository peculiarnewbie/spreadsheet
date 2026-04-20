/**
 * Formula scenarios — HyperFormula-backed dependency propagation against the
 * `/formulas` demo.
 *
 * Initial data (see `apps/solid-sheet-www/src/demos/formulas.tsx`):
 *
 *   row 0: [10,   20,   "=A1+B1"]      → C1 displays 30
 *   row 1: [30,   40,   "=A2+B2"]      → C2 displays 70
 *   row 2: [50,   60,   "=A3+B3"]      → C3 displays 110
 *   row 3: [null, null, "=SUM(C1:C3)"] → C4 displays 210
 *
 * We use `assertDisplayValue` (not `assertCellValue`) for the formula cells
 * because the raw value is the formula string, but what we want to verify is
 * the *computed* number the user sees.
 */

import type { Scenario } from "../types";

const DEMO_ID = "formulas";

export const formulasScenarios: Scenario[] = [
	{
		id: "formulas/sum-cascade-on-edit",
		title: "cascades SUM updates when a dependency changes",
		demoId: DEMO_ID,
		route: "/formulas",
		steps: [
			{ kind: "click", at: { row: 3, col: 2 }, caption: "Click C4 — the =SUM cell" },
			{ kind: "assertDisplayValue", at: { row: 3, col: 2 }, text: "210", caption: "C4 displays 210 (30+70+110)" },
			{ kind: "doubleClick", at: { row: 0, col: 0 }, caption: "Double-click A1 (10)" },
			{ kind: "type", text: "100", confirm: true, caption: "Type '100' + Enter" },
			{ kind: "assertDisplayValue", at: { row: 0, col: 2 }, text: "120", caption: "C1 recalculates: 100 + 20 = 120" },
			{ kind: "assertDisplayValue", at: { row: 3, col: 2 }, text: "300", caption: "C4 cascades: 120 + 70 + 110 = 300" },
		],
	},
];
