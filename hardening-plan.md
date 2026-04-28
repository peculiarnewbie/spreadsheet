# Hardening Plan

## Goals

- Make invalid TypeScript states harder to represent.
- Keep public APIs stable unless a breaking change is explicitly chosen.
- Prefer small, verifiable slices over broad rewrites.
- Use `better-result` where orchestration failures need explicit causes, not as a blanket style.

## Recommended Order

1. ✅ Fix strict TypeScript drift

   All `exactOptionalPropertyTypes` violations in production code are resolved:

   - `packages/spreadsheets/src/core/commands.ts` — use conditional spread for `viewAddress`/`rowId`
   - `packages/spreadsheets/src/core/history.ts` — use conditional spread in inverse mutation mapping
   - `packages/spreadsheets/src/core/state.ts` — use conditional spread for optional `UndoRedoResult` fields (undo + redo)
   - `packages/spreadsheets/src/grid/Grid.tsx` — remove unused `mapModelToVisualAddress`; use `rowId != null` guard
   - `packages/spreadsheets/src/grid/GridBody.tsx` — fix un-called `rowIdx` accessor

   Remaining `tsc` errors are test-only (`bun:test` module resolution, unused test import).

2. ✅ Remove remaining runtime non-null assertions

   All focus-area `!` usages in production code are resolved:

   - `workbookCoordinator()!` (8 sites) → `?.` for boolean/void calls; local guard + direct call for `didApplyResult` sites
   - `gridRef!` in `onCleanup` → capture local during `onMount`
   - `editCellRect()!` (4 props) → `Show` render-arg pattern (call accessor with `()`)
   - `columnResizeGuideLeft()!`, `rowResizeGuideTop()!` → `Show` render-arg pattern
   - `buildIndexOrder` `[i]!` (Grid.tsx + history.ts) → `for...of entries()`
   - `GridHeader.tsx` `[i]!` → `for...of entries()` / `as ColumnDef`
   - `autofill.ts` `[0]!` → `as CellRange`
   - `state.ts` `[i]!` in `reorderRows` → `for...of entries()`

   Remaining `!` in production is in tight loops / produce callbacks where the index is provably in-bounds (invariant assertions).

3. ✅ Add typed e2e helper wrappers

   Added typed helpers to `tests/e2e/setup.ts` and eliminated all `(window as any)` casts from test files:

   Helpers added:
   - `withSheetCtrl(fn)` — typed evaluate wrapper, throws if controller missing
   - `withSheetCtrlMaybe(fn)` — typed evaluate wrapper, allows null controller
   - `withWorkbookCtrl(sheetKey, fn)` — typed evaluate wrapper for workbook controllers
   - `getWorkbookData(sheetKey)` — typed data access
   - `getWorkbookChanges()` — typed changes access

   Casts removed:
   - `formulas.test.ts` (3 sites) → `withSheetCtrlMaybe`
   - `formula-rows.test.ts` (17 sites) → `withSheetCtrl` / `withSheetCtrlMaybe`
   - `formula-row-delete.test.ts` (12 sites) → `withSheetCtrl` / `withSheetCtrlMaybe`
   - `rows.test.ts` (7 sites) → `withSheetCtrl`
   - `cross-sheet.test.ts` (23 sites) → `withWorkbookCtrl` / `getWorkbookData`
   - `large.test.ts` (2 sites) → `withSheetCtrlMaybe` / typed `window.__SHEET_DATA__`
   - `custom-rendering.test.ts` (1 site) → typed `window.__SHEET_CONTROLLER__`

   Remaining `(window as unknown as {...})` casts in `stagehand.ts` driver are a lower-priority concern.

4. ✅ Add internal branded index and id types gradually

    All five brands introduced at once with a hard `CellAddress` → `VisualCellAddress` + `PhysicalCellAddress` split.

    Brands implemented:
    - `PhysicalRowIndex`  — post-sort row index in store/cells
    - `VisualRowIndex`    — pre-sort row index in UI/selection
    - `ColumnIndex`       — shared across visual and physical
    - `RowId`             — stable row identity across reorders
    - `FormulaSheetId`    — HyperFormula sheet ID internal

    Key splits:
    - `CellAddress` → `VisualCellAddress` (selection/UI) + `PhysicalCellAddress` (store access), with deprecation alias
    - `ResizeSessionState.targetId: string | number` → `rowTargetId?: RowId` + `columnTargetId?: string`
    - `Selection`, `CellRange`, `FillPreview`, `EditModeState` use `VisualCellAddress`
    - `CellMutation.address` is `PhysicalCellAddress`; `.viewAddress` is `VisualCellAddress`
    - `RowReorderMutation.oldOrder/newOrder` → `RowId[]`; `indexOrder` → `PhysicalRowIndex[]`

    Public APIs (`SheetController`, `renderCell`, `formatValue`, `getCellTitle`) kept unbranded.
    `toNumber()` used at `HyperFormulaLike` boundaries to strip brands.

5. Convert ambiguous orchestration-adjacent `null` results selectively

   Public UI helpers can stay simple, but internal subsystem boundaries should return explicit outcomes when the caller benefits from knowing why no action happened.

   Candidate areas:

   - workbook/controller lookup paths
   - row id to physical row lookup paths used during sync/reconciliation
   - undo/redo orchestration where `history-empty` is a meaningful no-op

   Use `OperationOutcome` / `ResultLike` only when the failure or no-op reason changes control flow or traceability.

6. ✅ Split `Grid.tsx` — sort state and row-order helpers

   Extracted pure sort utilities from `Grid.tsx` into `grid/sort.ts`:

   - `SortCollator`, `buildIndexOrder`, `isBlankSortValue`, `getSortTypeOrder`, `compareSortValues`, `compareSortableEntries`
   - Deduplicated `buildIndexOrder` (was in both `Grid.tsx` and `core/history.ts`) → single source in `core/indexOrder.ts`, imported by both `grid/sort.ts` and `core/history.ts`
   - `Grid.tsx` reduced by ~60 lines; `ContextMenuState` type preserved in place

   Remaining seams for future extraction:

   - formula bridge sync helpers
   - edit/formula-bar state transitions
   - resize session helpers

7. ✅ Add a reliable typecheck script

   Added typecheck scripts with source/test separation:

   - `packages/spreadsheets/package.json`: `typecheck` (production source only, via `tsconfig.src.json`), `typecheck:all` (includes tests)
   - Root `package.json`: `typecheck` (runs all packages), `typecheck:lib` (spreadsheets package only)
   - `tsconfig.src.json` extends `tsconfig.json` and excludes `**/*.test.ts`
   - `pnpm --filter peculiar-sheets typecheck` passes cleanly (0 errors)
   - `pnpm --filter peculiar-sheets typecheck:all` shows only `bun:test` module resolution errors (expected — test environment)

   Once existing strict TypeScript drift is resolved, add scripts that make type correctness easy to run locally and in CI.

   Candidate scripts:

   - `typecheck:lib`
   - `typecheck:e2e`
   - `typecheck`

   Keep source and test typechecks separate if test-only dependencies require different type environments.

## Verification

Run these after each implementation slice:

```sh
pnpm --filter peculiar-sheets build
pnpm --filter peculiar-sheets typecheck
pnpm --filter @peculiarnewbie/e2e build
```

Run targeted tests for touched behavior:

```sh
bun test packages/spreadsheets/src/core/history.test.ts
bun test packages/spreadsheets/src/formula/bridge.test.ts
bun test packages/spreadsheets/src/workbook/coordinator.test.ts
```

For browser behavior changes, run the e2e suite when the environment supports it:

```sh
bun run tests/e2e/run.ts
```

## Current Baseline Notes

- `pnpm --filter peculiar-sheets build` passes.
- `pnpm --filter peculiar-sheets typecheck` passes (production source only).
- `pnpm --filter @peculiarnewbie/e2e build` passes after the library build has produced `dist`.
- The library build currently emits an existing `tsdown` warning about an invalid `define` option.
- `tsc` production errors (steps 1 + 2) are **resolved**.
- Remaining `tsc` noise is test-only (`bun:test` module resolution in test files) — isolated via `tsconfig.src.json`.
