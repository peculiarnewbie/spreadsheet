/**
 * History scenarios — undo / redo flows against the `/history` demo.
 *
 * Initial data (see `apps/solid-sheet-www/src/demos/history.tsx`):
 *
 *   row 0: ["original",  100]
 *   row 1: ["untouched", 200]
 *
 * NB: `type({ confirm: true })` sends Enter at the end, which commits the
 * edit AND unmounts the cell editor. The DOM driver's `dispatchKey` routes
 * to `editor ?? grid`, so the subsequent `Control+z` lands on the grid
 * keyboard handler without any explicit `focusGrid` step — cleaner than the
 * Stagehand path, which has to refocus the grid after editing.
 */

import type { Scenario } from "../types";

const DEMO_ID = "history";

export const historyScenarios: Scenario[] = [
	{
		id: "history/undoes-a-cell-edit",
		title: "undoes a cell edit with Ctrl+Z",
		demoId: DEMO_ID,
		route: "/history",
		steps: [
			{ kind: "doubleClick", at: { row: 0, col: 0 }, caption: "Double-click A1 ('original')" },
			{ kind: "type", text: "changed", confirm: true, caption: "Type 'changed' + Enter" },
			{ kind: "assertCellValue", at: { row: 0, col: 0 }, value: "changed", caption: "A1 is now 'changed'" },
			{ kind: "press", key: "Control+z", caption: "Ctrl+Z to undo" },
			{ kind: "assertCellValue", at: { row: 0, col: 0 }, value: "original", caption: "A1 restored to 'original'" },
		],
	},

	{
		id: "history/redoes-after-undo",
		title: "redoes an undone edit with Ctrl+Y",
		demoId: DEMO_ID,
		route: "/history",
		steps: [
			{ kind: "doubleClick", at: { row: 0, col: 1 }, caption: "Double-click B1 (100)" },
			{ kind: "type", text: "999", confirm: true, caption: "Type '999' + Enter" },
			{ kind: "assertCellValue", at: { row: 0, col: 1 }, value: 999, caption: "B1 is now 999" },
			{ kind: "press", key: "Control+z", caption: "Ctrl+Z to undo" },
			{ kind: "assertCellValue", at: { row: 0, col: 1 }, value: 100, caption: "B1 back to 100" },
			{ kind: "press", key: "Control+y", caption: "Ctrl+Y to redo" },
			{ kind: "assertCellValue", at: { row: 0, col: 1 }, value: 999, caption: "B1 is 999 again" },
		],
	},
];
