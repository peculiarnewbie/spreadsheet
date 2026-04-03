import { Stagehand } from "@browserbasehq/stagehand";
import type { CellMutation, CellValue } from "@peculiarnewbie/spreadsheets";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3141";

let _stagehand: Stagehand | null = null;

/** Get or create the shared Stagehand instance. */
export async function getStagehand(): Promise<Stagehand> {
	if (!_stagehand) {
		_stagehand = new Stagehand({ env: "LOCAL" });
		await _stagehand.init();
	}
	return _stagehand;
}

/** Tear down the shared Stagehand instance. */
export async function closeStagehand(): Promise<void> {
	if (_stagehand) {
		await _stagehand.close();
		_stagehand = null;
	}
}

/** Navigate to a test route and wait for the harness to mount. */
export async function navigateTo(stagehand: Stagehand, route: string) {
	const page = stagehand.page;
	await page.goto(`${BASE_URL}${route}`);
	await page.waitForSelector('[data-testid="harness"]');
	// Give SolidJS a tick to hydrate and expose globals
	await page.waitForFunction(() => window.__SHEET_DATA__ !== undefined);
}

// ── Data helpers ──────────────────────────────────────────────────────────

/** Read the current sheet data from the harness. */
export async function getSheetData(stagehand: Stagehand): Promise<CellValue[][]> {
	return stagehand.page.evaluate(() => window.__SHEET_DATA__);
}

/** Read a single cell value from the harness. */
export async function getCellValue(
	stagehand: Stagehand,
	row: number,
	col: number,
): Promise<CellValue> {
	return stagehand.page.evaluate(
		({ r, c }) => window.__SHEET_DATA__[r]?.[c] ?? null,
		{ r: row, c: col },
	);
}

/** Get all recorded mutations. */
export async function getMutations(stagehand: Stagehand): Promise<CellMutation[]> {
	return stagehand.page.evaluate(() => window.__MUTATIONS__);
}

/** Clear the mutation log (useful between test cases sharing a route). */
export async function clearMutations(stagehand: Stagehand): Promise<void> {
	await stagehand.page.evaluate(() => {
		window.__MUTATIONS__ = [];
	});
}

// ── Interaction helpers ───────────────────────────────────────────────────

/**
 * Build a Playwright locator for a cell at the given row/col.
 * The grid uses aria-rowindex (1-indexed) on rows and aria-colindex (1-indexed) on cells.
 */
function cellLocator(stagehand: Stagehand, row: number, col: number) {
	return stagehand.page.locator(
		`[role="row"][aria-rowindex="${row + 1}"] [role="gridcell"][aria-colindex="${col + 1}"]`,
	);
}

/** Click a cell at the given (0-indexed) row/col position. */
export async function clickCell(
	stagehand: Stagehand,
	row: number,
	col: number,
) {
	await cellLocator(stagehand, row, col).click();
}

/** Double-click a cell to enter edit mode. */
export async function doubleClickCell(
	stagehand: Stagehand,
	row: number,
	col: number,
) {
	await cellLocator(stagehand, row, col).dblclick();
}

/** Get the displayed text content of a cell element. */
export async function getCellText(
	stagehand: Stagehand,
	row: number,
	col: number,
): Promise<string> {
	return (await cellLocator(stagehand, row, col).textContent()) ?? "";
}

/** Type into the currently active cell editor and press Enter. */
export async function typeIntoCell(
	stagehand: Stagehand,
	value: string,
	{ confirm = true }: { confirm?: boolean } = {},
) {
	const page = stagehand.page;
	await page.keyboard.type(value);
	if (confirm) {
		await page.keyboard.press("Enter");
	}
}

/** Press a key or key combo (e.g. "Control+z", "Delete", "Tab"). */
export async function press(stagehand: Stagehand, key: string) {
	await stagehand.page.keyboard.press(key);
}

/** Shift-click a cell to extend the current selection. */
export async function shiftClickCell(
	stagehand: Stagehand,
	row: number,
	col: number,
) {
	await cellLocator(stagehand, row, col).click({ modifiers: ["Shift"] });
}

/**
 * Drag the fill handle from its current position to a target cell.
 *
 * The fill handle (`.se-fill-handle`) sits at the bottom-right corner of the
 * primary selection. The grid resolves drag targets from mouse coordinates via
 * document-level mousemove/mouseup, so we use the low-level mouse API to
 * simulate the full drag gesture.
 */
export async function dragFillHandle(
	stagehand: Stagehand,
	targetRow: number,
	targetCol: number,
) {
	const page = stagehand.page;
	const handle = page.locator(".se-fill-handle");

	// Get fill handle center coordinates
	const handleBox = await handle.boundingBox();
	if (!handleBox) throw new Error("Fill handle not visible");

	const handleX = handleBox.x + handleBox.width / 2;
	const handleY = handleBox.y + handleBox.height / 2;

	// Get target cell center coordinates
	const target = cellLocator(stagehand, targetRow, targetCol);
	const targetBox = await target.boundingBox();
	if (!targetBox) throw new Error(`Target cell (${targetRow}, ${targetCol}) not visible`);

	const targetX = targetBox.x + targetBox.width / 2;
	const targetY = targetBox.y + targetBox.height / 2;

	// Perform the drag: move to handle → press → drag to target → release
	await page.mouse.move(handleX, handleY);
	await page.mouse.down();
	// Move in a few steps so the grid registers intermediate positions
	const steps = 5;
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		await page.mouse.move(
			handleX + (targetX - handleX) * t,
			handleY + (targetY - handleY) * t,
		);
	}
	await page.mouse.up();
}
