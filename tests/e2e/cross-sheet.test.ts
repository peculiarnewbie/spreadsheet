import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { clickContextMenuItem, getPage, getStagehand, getWorkbookData, navigateTo, withWorkbookCtrl } from "./setup";
import type { Stagehand } from "@browserbasehq/stagehand";

function sheetCellLocator(sheetTestId: string, row: number, col: number) {
	return getPage().locator(
		`[data-testid="${sheetTestId}"] [role="row"][aria-rowindex="${row + 1}"] [role="gridcell"][aria-colindex="${col + 1}"]`,
	);
}

async function dragWithinSheet(
	sheetTestId: string,
	startRow: number,
	startCol: number,
	endRow: number,
	endCol: number,
) {
	const page = getPage();
	const start = await sheetCellLocator(sheetTestId, startRow, startCol).centroid();
	const end = await sheetCellLocator(sheetTestId, endRow, endCol).centroid();

	await page.sendCDP("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: start.x,
		y: start.y,
		button: "none",
	});
	await page.sendCDP("Input.dispatchMouseEvent", {
		type: "mousePressed",
		x: start.x,
		y: start.y,
		button: "left",
		clickCount: 1,
	});
	await page.sendCDP("Input.dispatchMouseEvent", {
		type: "mouseMoved",
		x: end.x,
		y: end.y,
		button: "left",
		buttons: 1,
	});
	await page.sendCDP("Input.dispatchMouseEvent", {
		type: "mouseReleased",
		x: end.x,
		y: end.y,
		button: "left",
		clickCount: 1,
	});
}

async function rightClickSheetHeader(sheetTestId: string, label: string) {
	const page = getPage();
	await page.evaluate(({ testId, targetLabel }) => {
		const wrapper = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
		if (!wrapper) throw new Error(`Sheet wrapper not found: ${testId}`);
		const headers = Array.from(
			wrapper.querySelectorAll<HTMLElement>(".se-header-row--columns .se-header-cell"),
		);
		const header = headers.find((element) =>
			(element.textContent ?? "").trim().startsWith(targetLabel),
		);
		if (!header) throw new Error(`Header not found: ${targetLabel}`);
		const rect = header.getBoundingClientRect();
		const clientX = rect.left + rect.width / 2;
		const clientY = rect.top + rect.height / 2;
		header.dispatchEvent(new MouseEvent("mousedown", {
			bubbles: true,
			button: 2,
			buttons: 2,
			clientX,
			clientY,
		}));
		header.dispatchEvent(new MouseEvent("contextmenu", {
			bubbles: true,
			button: 2,
			buttons: 2,
			clientX,
			clientY,
		}));
		header.dispatchEvent(new MouseEvent("mouseup", {
			bubbles: true,
			button: 2,
			buttons: 0,
			clientX,
			clientY,
		}));
	}, { testId: sheetTestId, targetLabel: label });

	// Poll until the context menu appears — sorts are triggered through it now
	// that header-click sorting was removed.
	const start = Date.now();
	while (Date.now() - start < 5_000) {
		const exists = await page.evaluate(() => Boolean(document.querySelector(".se-context-menu")));
		if (exists) return;
		await page.waitForTimeout(50);
	}
	throw new Error("Context menu did not appear after right-click on sheet header");
}

describe("cross-sheet workbook mode", () => {
	let sh: Stagehand;

	beforeAll(async () => {
		sh = await getStagehand();
	});

	beforeEach(async () => {
		await navigateTo(sh, "/cross-sheet");
	});

	it("evaluates cross-sheet formulas on initial load", async () => {
		const total = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getDisplayCellValue(0, 1),
		);
		const first = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getDisplayCellValue(1, 1),
		);

		expect(total).toBe(60);
		expect(first).toBe("Alpha");
	});

	it("propagates source-sheet edits to dependent sheets", async () => {
		await withWorkbookCtrl("data", (ctrl) => ctrl?.setCellValue(0, 1, 100));

		const total = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getDisplayCellValue(0, 1),
		);
		expect(total).toBe(150);
	});

	it("inserts cross-sheet references on click", async () => {
		await withWorkbookCtrl("summary", (ctrl) => {
			ctrl?.startEditing(3, 1);
			ctrl?.setActiveEditorValue("=");
		});

		await sheetCellLocator("sheet-data", 0, 0).click();

		const text = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getEditorText(),
		);
		const highlightCount = await getPage().locator('[data-testid="sheet-data"] .se-reference-rect').count();

		expect(text).toBe("=Data!A1");
		expect(highlightCount).toBe(1);
	});

	it("inserts cross-sheet ranges on drag and clears remote highlights on mouseup", async () => {
		await withWorkbookCtrl("summary", (ctrl) => {
			ctrl?.startEditing(3, 1);
			ctrl?.setActiveEditorValue("=");
		});

		await dragWithinSheet("sheet-data", 0, 0, 1, 1);

		const text = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getEditorText(),
		);
		const highlightCount = await getPage().locator('[data-testid="sheet-data"] .se-reference-rect').count();

		expect(text).toBe("=Data!A1:B2");
		expect(highlightCount).toBe(0);
	});

	it("clears click-based remote highlights on commit", async () => {
		await withWorkbookCtrl("summary", (ctrl) => {
			ctrl?.startEditing(3, 1);
			ctrl?.setActiveEditorValue("=");
		});

		await sheetCellLocator("sheet-data", 0, 0).click();
		expect(await getPage().locator('[data-testid="sheet-data"] .se-reference-rect').count()).toBe(1);

		await withWorkbookCtrl("summary", (ctrl) => ctrl?.commitActiveEditor());

		expect(await getPage().locator('[data-testid="sheet-data"] .se-reference-rect').count()).toBe(0);
	});

	it("rewrites cross-sheet formulas through workbook row insert/delete snapshots", async () => {
		await withWorkbookCtrl("data", (ctrl) => ctrl?.insertRows(1, 1));

		const afterInsert = await getWorkbookData("summary");
		expect(afterInsert[0][1]).toBe("=SUM(Data!B1:B4)");
		expect(afterInsert[2][1]).toBe("=Data!B3");

		await withWorkbookCtrl("data", (ctrl) => ctrl?.deleteRows(1, 1));

		const afterDelete = await getWorkbookData("summary");
		expect(afterDelete[0][1]).toBe("=SUM(Data!B1:B3)");
		expect(afterDelete[2][1]).toBe("=Data!B2");
	});

	it("uses workbook-backed undo and redo for structural history", async () => {
		await withWorkbookCtrl("data", (ctrl) => ctrl?.insertRows(1, 1));

		await withWorkbookCtrl("data", (ctrl) => ctrl?.undo());

		let summary = await getWorkbookData("summary");
		expect(summary[0][1]).toBe("=SUM(Data!B1:B3)");

		await withWorkbookCtrl("data", (ctrl) => ctrl?.redo());

		summary = await getWorkbookData("summary");
		expect(summary[0][1]).toBe("=SUM(Data!B1:B4)");
	});

	it("keeps cross-sheet dependents coherent after mutation sort", async () => {
		await rightClickSheetHeader("sheet-data", "Value");
		await clickContextMenuItem(sh, "Sort Z-A");

		const data = await getWorkbookData("data");
		const total = await withWorkbookCtrl("summary",
			(ctrl) => ctrl?.getDisplayCellValue(0, 1),
		);

		expect(data[0][0]).toBe("Gamma");
		expect(total).toBe(60);
	});
});
