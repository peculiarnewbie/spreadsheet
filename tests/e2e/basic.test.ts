import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
	getStagehand,
	navigateTo,
	getSheetData,
	getCellValue,
	getMutations,
	clearMutations,
	clickCell,
	doubleClickCell,
	typeIntoCell,
	press,
	getPage,
} from "./setup";
import type { Stagehand } from "@browserbasehq/stagehand";

describe("basic", () => {
	let sh: Stagehand;

	async function getActiveEditorState() {
		return getPage().evaluate(() => {
			const active = document.activeElement;
			if (!(active instanceof HTMLInputElement)) return null;
			return {
				value: active.value,
				selectionStart: active.selectionStart,
				selectionEnd: active.selectionEnd,
			};
		});
	}

	async function dispatchEditorArrowKey(key: "ArrowLeft" | "ArrowRight") {
		return getPage().evaluate((pressedKey: "ArrowLeft" | "ArrowRight") => {
			const input = document.querySelector(".se-cell-editor");
			if (!(input instanceof HTMLInputElement)) return null;

			const event = new KeyboardEvent("keydown", {
				key: pressedKey,
				code: pressedKey,
				bubbles: true,
				cancelable: true,
			});
			input.dispatchEvent(event);

			return {
				editorStillMounted: document.querySelector(".se-cell-editor") instanceof HTMLInputElement,
			};
		}, key);
	}

	beforeAll(async () => {
		sh = await getStagehand();
		await navigateTo(sh, "/basic");
	});

	beforeEach(async () => {
		await clearMutations(sh);
	});

	// ── Selection ─────────────────────────────────────────────────────

	it("selects a cell on click", async () => {
		await clickCell(sh, 0, 0);
		const selection = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 0, col: 0 });
	});

	it("moves selection with arrow keys", async () => {
		await clickCell(sh, 0, 0);
		await press(sh, "ArrowRight");
		await press(sh, "ArrowDown");

		const selection = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 1, col: 1 });
	});

	it("moves selection with Tab", async () => {
		await clickCell(sh, 0, 0);
		await press(sh, "Tab");

		const selection = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 0, col: 1 });
	});

	// ── Editing ───────────────────────────────────────────────────────

	it("edits a cell on double-click and Enter", async () => {
		await doubleClickCell(sh, 0, 0);
		await typeIntoCell(sh, "Zara");

		const value = await getCellValue(sh, 0, 0);
		expect(value).toBe("Zara");

		const mutations = await getMutations(sh);
		expect(mutations).toHaveLength(1);
		expect(mutations[0]!.newValue).toBe("Zara");
		expect(mutations[0]!.oldValue).toBe("Alice");
		expect(mutations[0]!.source).toBe("user");
	});

	it("starts editing when typing directly on a selected cell", async () => {
		await clickCell(sh, 1, 1);
		await typeIntoCell(sh, "99");

		const value = await getCellValue(sh, 1, 1);
		expect(value).toBe(99);
	});

	it("cancels editing with Escape", async () => {
		const before = await getCellValue(sh, 2, 0);
		await doubleClickCell(sh, 2, 0);
		await getPage().type("NOPE");
		await press(sh, "Escape");

		const after = await getCellValue(sh, 2, 0);
		expect(after).toBe(before);
	});

	// ── Deletion ──────────────────────────────────────────────────────

	it("clears a cell with Delete key", async () => {
		// First put a known value in
		await doubleClickCell(sh, 4, 3);
		await typeIntoCell(sh, "999");
		await clearMutations(sh);

		await clickCell(sh, 4, 3);
		await press(sh, "Delete");

		const value = await getCellValue(sh, 4, 3);
		expect(value).toBeNull();

		const mutations = await getMutations(sh);
		expect(mutations).toHaveLength(1);
		expect(mutations[0]!.source).toBe("delete");
	});

	// ── Keyboard navigation ───────────────────────────────────────────

	it("starts editing on Enter, commits and moves down on second Enter", async () => {
		await clickCell(sh, 1, 0);
		// First Enter starts editing
		await press(sh, "Enter");

		// Still on same row (now in edit mode)
		let sel = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(sel?.anchor.row).toBe(1);

		// Second Enter commits edit and moves down
		await press(sh, "Enter");
		sel = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(sel?.anchor.row).toBe(2);
	});

	it("keeps left/right arrows inside the cell editor", async () => {
		const initialValue = await getCellValue(sh, 0, 0);
		const initialText = initialValue == null ? "" : String(initialValue);

		await clickCell(sh, 0, 0);
		await press(sh, "Enter");

		let editor = await getActiveEditorState();
		expect(editor?.value).toBe(initialText);
		expect(editor?.selectionStart).toBe(initialText.length);
		expect(editor?.selectionEnd).toBe(initialText.length);

		let arrowResult = await dispatchEditorArrowKey("ArrowLeft");
		expect(arrowResult?.editorStillMounted).toBe(true);

		editor = await getActiveEditorState();
		expect(editor?.value).toBe(initialText);

		let selection = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 0, col: 0 });

		await press(sh, "Escape");
		await doubleClickCell(sh, 0, 0);

		editor = await getActiveEditorState();
		expect(editor?.selectionStart).toBe(0);
		expect(editor?.selectionEnd).toBe(initialText.length);

		arrowResult = await dispatchEditorArrowKey("ArrowRight");
		expect(arrowResult?.editorStillMounted).toBe(true);

		editor = await getActiveEditorState();
		expect(editor?.value).toBe(initialText);

		selection = await getPage().evaluate(
			() => (window as any).__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 0, col: 0 });

		await press(sh, "Escape");
	});
});
