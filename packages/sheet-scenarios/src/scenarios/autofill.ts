/**
 * Autofill scenarios — drag-fill flows against the `/autofill` demo.
 *
 * Initial data (see `apps/solid-sheet-www/src/demos/autofill.tsx`):
 *
 *   row 0: [1,    "alpha", 100]
 *   row 1: [2,    "beta",  200]
 *   row 2: [3,    "gamma", 300]
 *   rows 3–7: empty
 */

import type { Scenario } from "../types";

const DEMO_ID = "autofill";

export const autofillScenarios: Scenario[] = [
	{
		id: "autofill/fills-numeric-series-downward",
		title: "extrapolates a numeric series on drag-fill",
		demoId: DEMO_ID,
		route: "/autofill",
		steps: [
			{ kind: "click", at: { row: 0, col: 0 }, caption: "Click the first Sequence cell (1)" },
			{ kind: "shiftClick", at: { row: 2, col: 0 }, caption: "Shift-click to extend selection through row 3" },
			{ kind: "dragFill", to: { row: 5, col: 0 }, caption: "Drag the fill handle down to row 6" },
			{ kind: "assertCellValue", at: { row: 3, col: 0 }, value: 4, caption: "Row 4 continues the series: 4" },
			{ kind: "assertCellValue", at: { row: 4, col: 0 }, value: 5, caption: "Row 5: 5" },
			{ kind: "assertCellValue", at: { row: 5, col: 0 }, value: 6, caption: "Row 6: 6" },
		],
	},

	{
		id: "autofill/fills-text-values-by-repeating",
		title: "repeats text values cyclically",
		demoId: DEMO_ID,
		route: "/autofill",
		steps: [
			{ kind: "click", at: { row: 0, col: 1 }, caption: "Click 'alpha'" },
			{ kind: "shiftClick", at: { row: 2, col: 1 }, caption: "Shift-click to select alpha/beta/gamma" },
			{ kind: "dragFill", to: { row: 7, col: 1 }, caption: "Drag fill handle to row 8" },
			{ kind: "assertCellValue", at: { row: 3, col: 1 }, value: "alpha", caption: "Cycle restarts: alpha" },
			{ kind: "assertCellValue", at: { row: 4, col: 1 }, value: "beta" },
			{ kind: "assertCellValue", at: { row: 5, col: 1 }, value: "gamma" },
			{ kind: "assertCellValue", at: { row: 6, col: 1 }, value: "alpha", caption: "Second cycle: alpha" },
			{ kind: "assertCellValue", at: { row: 7, col: 1 }, value: "beta" },
		],
	},
];
