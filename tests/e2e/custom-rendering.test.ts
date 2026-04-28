/**
 * E2E coverage for the four column-level customization hooks on `ColumnDef`:
 *
 *   formatValue    — text rendering + editor seed
 *   parseValue     — commit-time text → raw
 *   renderCell     — replace inner `<span class="se-cell__text">`
 *   getCellTitle   — cell tooltip override
 *
 * Harness route: `apps/e2e/src/routes/custom-rendering.tsx`
 *   col 0 — "Label"      → no hooks (baseline)
 *   col 1 — "Localized"  → formatValue + parseValue + getCellTitle (NSLOCTEXT round-trip)
 *   col 2 — "Status"     → renderCell only (status pill)
 *
 * Contract assertions live here rather than in unit tests because the relevant
 * code (`startEditing`, `handleEditorCommit`, `GridCell` render path) requires
 * a real DOM + the Solid reactive scheduler. The headless pieces are covered
 * in `packages/spreadsheets/src/core/column-hooks.test.ts`.
 */
import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import {
	getStagehand,
	navigateTo,
	getCellValue,
	getCellText,
	getMutations,
	clearMutations,
	clickCell,
	doubleClickCell,
	typeIntoCell,
	press,
	getPage,
} from "./setup";
import type { Stagehand } from "@browserbasehq/stagehand";

describe("custom rendering hooks", () => {
	let sh: Stagehand;

	async function getEditorValue(): Promise<string | null> {
		return getPage().evaluate(() => {
			const input = document.querySelector(".se-cell-editor");
			if (!(input instanceof HTMLInputElement)) return null;
			return input.value;
		});
	}

	async function getCellTitle(row: number, col: number): Promise<string | null> {
		return getPage().evaluate(
			({ r, c }: { r: number; c: number }) => {
				const cell = document.querySelector<HTMLElement>(
					`[role="row"][aria-rowindex="${r + 1}"] [role="gridcell"][aria-colindex="${c + 1}"]`,
				);
				return cell?.getAttribute("title") ?? null;
			},
			{ r: row, c: col },
		);
	}

	async function getStatusPill(
		row: number,
		col: number,
	): Promise<{ status: string | null; text: string } | null> {
		return getPage().evaluate(
			({ r, c }: { r: number; c: number }) => {
				const pill = document.querySelector<HTMLElement>(
					`[role="row"][aria-rowindex="${r + 1}"] [role="gridcell"][aria-colindex="${c + 1}"] [data-testid="status-pill"]`,
				);
				if (!pill) return null;
				return {
					status: pill.getAttribute("data-status"),
					text: (pill.textContent ?? "").trim(),
				};
			},
			{ r: row, c: col },
		);
	}

	beforeAll(async () => {
		sh = await getStagehand();
		await navigateTo(sh, "/custom-rendering");
	});

	beforeEach(async () => {
		await clearMutations(sh);
	});

	// ── Baseline: no hooks → behavior is unchanged ───────────────────

	it("renders the plain Label column with no transforms (baseline)", async () => {
		expect(await getCellText(sh, 0, 0)).toBe("Save Button");
		expect(await getCellValue(sh, 0, 0)).toBe("Save Button");
		// No getCellTitle on col 0 → title falls back to the rendered text.
		expect(await getCellTitle(0, 0)).toBe("Save Button");
	});

	// ── formatValue + getCellTitle (display-only) ────────────────────

	it("formatValue renders the inner NSLOCTEXT text, not the wrapper", async () => {
		// Raw cell data still holds the full NSLOCTEXT string…
		expect(await getCellValue(sh, 0, 1)).toBe(
			'NSLOCTEXT("menu","btn.save","Save")',
		);
		// …but the cell DOM shows the inner text only.
		expect(await getCellText(sh, 0, 1)).toBe("Save");
		expect(await getCellText(sh, 1, 1)).toBe("Cancel");
		expect(await getCellText(sh, 2, 1)).toBe("Delete");
		expect(await getCellText(sh, 3, 1)).toBe("Open...");
	});

	it("getCellTitle surfaces the structural metadata on hover", async () => {
		expect(await getCellTitle(0, 1)).toBe("area: menu · id: btn.save");
		expect(await getCellTitle(1, 1)).toBe("area: menu · id: btn.cancel");
		expect(await getCellTitle(3, 1)).toBe("area: dialog · id: file.open");
	});

	// ── Editor seeding: formatValue also seeds the inline editor ─────

	it("seeds the editor with formatValue output, not the raw wrapper", async () => {
		await doubleClickCell(sh, 0, 1);
		expect(await getEditorValue()).toBe("Save");
		await press(sh, "Escape");
	});

	// ── parseValue: commit preserves structural metadata ─────────────

	it("parseValue re-wraps the edited text while preserving area + id", async () => {
		await doubleClickCell(sh, 0, 1);
		// Editor is seeded with "Save" and fully selected by default, so typing
		// replaces the value outright.
		await typeIntoCell(sh, "Save As");

		// Raw cell data keeps the NSLOCTEXT wrapper with preserved area/id.
		expect(await getCellValue(sh, 0, 1)).toBe(
			'NSLOCTEXT("menu","btn.save","Save As")',
		);
		// Display updates to the new inner text.
		expect(await getCellText(sh, 0, 1)).toBe("Save As");
		// Tooltip metadata is preserved.
		expect(await getCellTitle(0, 1)).toBe("area: menu · id: btn.save");

		const mutations = await getMutations(sh);
		expect(mutations).toHaveLength(1);
		expect(mutations[0]!.oldValue).toBe(
			'NSLOCTEXT("menu","btn.save","Save")',
		);
		expect(mutations[0]!.newValue).toBe(
			'NSLOCTEXT("menu","btn.save","Save As")',
		);
	});

	it("identity short-circuit: committing unchanged editor text emits no mutation", async () => {
		// Cancel row (row 1) — still has the original NSLOCTEXT value from the
		// initial data; the preceding test only touched row 0.
		const rawBefore = await getCellValue(sh, 1, 1);
		expect(rawBefore).toBe('NSLOCTEXT("menu","btn.cancel","Cancel")');

		await doubleClickCell(sh, 1, 1);
		expect(await getEditorValue()).toBe("Cancel");
		// Press Enter without changing anything. parseValue returns the same
		// raw string; commitCellEdit's `oldValue === newValue` short-circuits.
		await press(sh, "Enter");

		expect(await getCellValue(sh, 1, 1)).toBe(
			'NSLOCTEXT("menu","btn.cancel","Cancel")',
		);
		const mutations = await getMutations(sh);
		expect(mutations).toHaveLength(0);
	});

	it("Escape during edit preserves the raw wrapper", async () => {
		const rawBefore = await getCellValue(sh, 2, 1);
		expect(rawBefore).toBe('NSLOCTEXT("menu","btn.delete","Delete")');

		await doubleClickCell(sh, 2, 1);
		await getPage().type("NUKE");
		await press(sh, "Escape");

		expect(await getCellValue(sh, 2, 1)).toBe(rawBefore);
		expect(await getCellText(sh, 2, 1)).toBe("Delete");
		expect(await getMutations(sh)).toHaveLength(0);
	});

	// ── renderCell: status pill replaces the inner span ──────────────

	it("renderCell mounts custom DOM inside the cell (status pill)", async () => {
		const pill0 = await getStatusPill(0, 2);
		expect(pill0).toEqual({ status: "active", text: "active" });

		const pill1 = await getStatusPill(1, 2);
		expect(pill1).toEqual({ status: "pending", text: "pending" });

		const pill2 = await getStatusPill(2, 2);
		expect(pill2).toEqual({ status: "error", text: "error" });

		const pill3 = await getStatusPill(3, 2);
		expect(pill3).toEqual({ status: "active", text: "active" });
	});

	it("renderCell preserves the outer cell contract (selection works)", async () => {
		// The outer `<div class="se-cell">` still owns click/selection even
		// though the inner span is replaced by the user's pill.
		await clickCell(sh, 2, 2);
		const selection = await getPage().evaluate(
			() => window.__SHEET_CONTROLLER__?.getSelection(),
		);
		expect(selection?.anchor).toEqual({ row: 2, col: 2 });
	});

	it("renderCell returns null while isEditing, editor takes over", async () => {
		// The harness returns null from renderCell when isEditing is true,
		// so the pill should disappear while the editor is mounted and come
		// back after commit.
		await doubleClickCell(sh, 0, 2);
		// Editor is now overlaying; pill should be unmounted.
		expect(await getStatusPill(0, 2)).toBeNull();

		await press(sh, "Escape");
		const pillAfter = await getStatusPill(0, 2);
		expect(pillAfter).toEqual({ status: "active", text: "active" });
	});
});
