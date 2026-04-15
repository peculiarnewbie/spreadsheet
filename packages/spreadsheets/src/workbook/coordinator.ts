import type { CellRange, CellValue, EditModeState, FormulaEngineConfig, SheetController } from "../types";
import { normalizeRange } from "../core/selection";
import type {
	WorkbookCoordinator,
	WorkbookCoordinatorOptions,
	WorkbookSheetBinding,
	WorkbookSheetDefinition,
	WorkbookStructuralChange,
	WorkbookStructuralOrigin,
} from "./types";

interface HyperFormulaWorkbookLike {
	addSheet(name?: string): string;
	getSheetId(name: string): number | undefined;
	getSheetName(sheetId: number): string | undefined;
	simpleCellRangeToString(
		range: {
			start: { sheet: number; row: number; col: number };
			end: { sheet: number; row: number; col: number };
		},
		contextSheetId: number,
	): string | undefined;
	setSheetContent(sheetId: number, values: unknown[][]): unknown;
	getSheetSerialized(sheetId: number): unknown[][];
	addRows(sheetId: number, ...indexes: [number, number][]): unknown;
	isItPossibleToAddRows(sheetId: number, ...indexes: [number, number][]): boolean;
	removeRows(sheetId: number, ...indexes: [number, number][]): unknown;
	isItPossibleToRemoveRows(sheetId: number, ...indexes: [number, number][]): boolean;
	setRowOrder(sheetId: number, newRowOrder: number[]): unknown;
	isItPossibleToSetRowOrder(sheetId: number, newRowOrder: number[]): boolean;
}

interface WorkbookHistoryEntry {
	origin: WorkbookStructuralOrigin;
	before: WorkbookStructuralChange["snapshots"];
	after: WorkbookStructuralChange["snapshots"];
}

interface WorkbookSheetRuntime {
	sheetKey: string;
	formulaName: string;
	sheetId: number;
	controller: SheetController | null;
	getCells: (() => CellValue[][]) | null;
	lastKnownCells: CellValue[][];
}

interface ReferenceSession {
	sourceSheetKey: string;
	targetSheetKey: string;
	anchor: { row: number; col: number };
	didDrag: boolean;
}

export interface WorkbookCoordinatorInternals {
	getFormulaEngineConfig(binding: WorkbookSheetBinding): FormulaEngineConfig;
	attachController(sheetKey: string, controller: SheetController): void;
	detachController(sheetKey: string, controller: SheetController): void;
	attachDataGetter(sheetKey: string, getCells: () => CellValue[][]): void;
	detachDataGetter(sheetKey: string, getCells: () => CellValue[][]): void;
	handleCellPointerDown(sheetKey: string, address: { row: number; col: number }, event: MouseEvent): boolean;
	handleCellPointerMove(sheetKey: string, address: { row: number; col: number }, event: MouseEvent): boolean;
	handleEditModeChange(sheetKey: string, state: EditModeState | null): void;
}

export const workbookCoordinatorInternals = Symbol("workbookCoordinatorInternals");

type WorkbookCoordinatorWithInternals = WorkbookCoordinator & {
	[workbookCoordinatorInternals]: WorkbookCoordinatorInternals;
};

function cloneCells(cells: CellValue[][]): CellValue[][] {
	return cells.map((row) => [...row]);
}

function normalizeEngineValue(value: CellValue): CellValue {
	if (typeof value !== "string") return value;

	const trimmed = value.trim();
	if (!trimmed.startsWith("=")) return value;

	let rest = trimmed.slice(1);
	while (rest.startsWith("=")) {
		rest = rest.slice(1);
	}

	return `=${rest}`;
}

function normalizeSnapshotValue(value: unknown): CellValue {
	if (value === undefined) return null;
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value;
	}
	return String(value);
}

function normalizeSnapshotRows(rows: unknown[][]): CellValue[][] {
	return rows.map((row) => row.map((value) => normalizeSnapshotValue(value)));
}

function normalizeSheetContent(cells: CellValue[][]): CellValue[][] {
	return cells.map((row) => row.map((value) => normalizeEngineValue(value)));
}

export function getWorkbookCoordinatorInternals(
	coordinator: WorkbookCoordinator,
): WorkbookCoordinatorInternals {
	return (coordinator as WorkbookCoordinatorWithInternals)[workbookCoordinatorInternals];
}

export function createWorkbookCoordinator(
	options: WorkbookCoordinatorOptions,
): WorkbookCoordinator {
	const hf = options.engine as HyperFormulaWorkbookLike;
	const sheets = new Map<string, WorkbookSheetRuntime>();
	const sheetKeysByFormulaName = new Map<string, string>();
	const listeners = new Set<(change: WorkbookStructuralChange) => void>();
	const history: WorkbookHistoryEntry[] = [];
	let historyIndex = 0;
	let referenceSession: ReferenceSession | null = null;
	let cleanupReferenceSession: (() => void) | null = null;

	function ensureSheetId(formulaName: string): number {
		const existing = hf.getSheetId(formulaName);
		if (existing !== undefined) return existing;

		const actualName = hf.addSheet(formulaName);
		const sheetId = hf.getSheetId(actualName);
		if (sheetId === undefined) {
			throw new Error(`Failed to create workbook sheet "${formulaName}".`);
		}
		return sheetId;
	}

	function getSheetRuntime(sheetKey: string): WorkbookSheetRuntime {
		const runtime = sheets.get(sheetKey);
		if (!runtime) {
			throw new Error(`Workbook sheet "${sheetKey}" is not registered.`);
		}
		return runtime;
	}

	function buildSnapshots(): WorkbookStructuralChange["snapshots"] {
		return Array.from(sheets.values()).map((runtime) => {
			const serialized = hf.getSheetSerialized(runtime.sheetId);
			const cells = normalizeSnapshotRows(serialized);
			runtime.lastKnownCells = cloneCells(cells);
			return {
				sheetKey: runtime.sheetKey,
				cells,
			};
		});
	}

	function emitChange(
		origin: WorkbookStructuralOrigin,
		snapshots: WorkbookStructuralChange["snapshots"],
	): WorkbookStructuralChange {
		const change = { origin, snapshots };
		for (const listener of listeners) {
			listener(change);
		}
		return change;
	}

	function syncRegisteredSheetsToEngine() {
		for (const runtime of sheets.values()) {
			const cells = runtime.getCells ? runtime.getCells() : runtime.lastKnownCells;
			const normalized = normalizeSheetContent(cells);
			hf.setSheetContent(runtime.sheetId, normalized);
			runtime.lastKnownCells = cloneCells(normalized);
		}
	}

	function pushHistoryEntry(entry: WorkbookHistoryEntry) {
		history.splice(historyIndex);
		history.push(entry);
		historyIndex = history.length;
	}

	function applyStructuralOperation(
		origin: WorkbookStructuralOrigin,
		apply: () => void,
	): WorkbookStructuralChange | null {
		syncRegisteredSheetsToEngine();
		const before = buildSnapshots();
		apply();
		const after = buildSnapshots();
		pushHistoryEntry({ origin, before, after });
		return emitChange(origin, after);
	}

	function findActiveReferenceSource(excludedSheetKey: string): WorkbookSheetRuntime | null {
		for (const runtime of sheets.values()) {
			if (runtime.sheetKey === excludedSheetKey) continue;
			if (runtime.controller?.canInsertReference()) {
				return runtime;
			}
		}
		return null;
	}

	function installReferenceSessionCleanup() {
		if (cleanupReferenceSession || typeof document === "undefined") return;

		const handleMouseUp = () => {
			if (referenceSession?.didDrag) {
				clearReferenceHighlights();
			}
			referenceSession = null;
		};

		document.addEventListener("mouseup", handleMouseUp);
		cleanupReferenceSession = () => {
			document.removeEventListener("mouseup", handleMouseUp);
			cleanupReferenceSession = null;
		};
	}

	function clearReferenceHighlights() {
		for (const runtime of sheets.values()) {
			runtime.controller?.setReferenceHighlight(null);
		}
		referenceSession = null;
		cleanupReferenceSession?.();
	}

	function insertReference(
		sourceSheetKey: string,
		targetSheetKey: string,
		range: CellRange,
	): boolean {
		const source = getSheetRuntime(sourceSheetKey);
		const target = getSheetRuntime(targetSheetKey);
		const sourceController = source.controller;
		const targetController = target.controller;
		if (!sourceController || !targetController || !sourceController.canInsertReference()) {
			return false;
		}

		const normalized = normalizeRange(range);
		const sheetRange = {
			start: { ...normalized.start, sheet: target.sheetId },
			end: { ...normalized.end, sheet: target.sheetId },
		};
		const reference = hf.simpleCellRangeToString(sheetRange, source.sheetId);
		if (!reference) return false;

		sourceController.insertReferenceText(reference);
		targetController.setReferenceHighlight(normalized);
		return true;
	}

	const internals: WorkbookCoordinatorInternals = {
		getFormulaEngineConfig(binding) {
			const runtime = getSheetRuntime(binding.sheetKey);
			if (runtime.formulaName !== binding.formulaName) {
				throw new Error(
					`Workbook binding mismatch for "${binding.sheetKey}": expected formula name "${runtime.formulaName}", received "${binding.formulaName}".`,
				);
			}

			return {
				instance: hf,
				sheetId: runtime.sheetId,
				sheetName: runtime.formulaName,
			};
		},

		attachController(sheetKey, controller) {
			getSheetRuntime(sheetKey).controller = controller;
		},

		detachController(sheetKey, controller) {
			const runtime = getSheetRuntime(sheetKey);
			if (runtime.controller === controller) {
				runtime.controller?.setReferenceHighlight(null);
				runtime.controller = null;
			}
			if (referenceSession?.sourceSheetKey === sheetKey || referenceSession?.targetSheetKey === sheetKey) {
				clearReferenceHighlights();
			}
		},

		attachDataGetter(sheetKey, getCells) {
			const runtime = getSheetRuntime(sheetKey);
			runtime.getCells = getCells;
			runtime.lastKnownCells = cloneCells(getCells());
		},

		detachDataGetter(sheetKey, getCells) {
			const runtime = getSheetRuntime(sheetKey);
			if (runtime.getCells === getCells) {
				runtime.lastKnownCells = cloneCells(getCells());
				runtime.getCells = null;
			}
		},

		handleCellPointerDown(sheetKey, address, event) {
			if (event.button === 2) return false;

			const source = findActiveReferenceSource(sheetKey);
			if (!source) return false;

			event.preventDefault();
			event.stopPropagation();

			const inserted = insertReference(source.sheetKey, sheetKey, {
				start: address,
				end: address,
			});
			if (!inserted) return false;

			referenceSession = {
				sourceSheetKey: source.sheetKey,
				targetSheetKey: sheetKey,
				anchor: address,
				didDrag: false,
			};
			installReferenceSessionCleanup();
			return true;
		},

		handleCellPointerMove(sheetKey, address, event) {
			if (!referenceSession || referenceSession.targetSheetKey !== sheetKey) return false;
			if ((event.buttons & 1) === 0) return false;

			const { sourceSheetKey, anchor } = referenceSession;
			const inserted = insertReference(sourceSheetKey, sheetKey, {
				start: anchor,
				end: address,
			});
			if (inserted) {
				referenceSession.didDrag = true;
			}
			return inserted;
		},

		handleEditModeChange(sheetKey, state) {
			if (!state) {
				clearReferenceHighlights();
				if (referenceSession?.sourceSheetKey === sheetKey) {
					referenceSession = null;
				}
			}
		},
	};

	function restoreSnapshots(
		origin: WorkbookStructuralOrigin,
		snapshots: WorkbookStructuralChange["snapshots"],
	): WorkbookStructuralChange {
		for (const snapshot of snapshots) {
			const runtime = getSheetRuntime(snapshot.sheetKey);
			hf.setSheetContent(runtime.sheetId, normalizeSheetContent(snapshot.cells));
			runtime.lastKnownCells = cloneCells(snapshot.cells);
		}
		return emitChange(origin, buildSnapshots());
	}

	const coordinator: WorkbookCoordinatorWithInternals = {
		bindSheet(definition) {
			const existing = sheets.get(definition.sheetKey);
			if (existing) {
				if (existing.formulaName !== definition.formulaName) {
					throw new Error(
						`Workbook sheet "${definition.sheetKey}" is already bound to formula name "${existing.formulaName}".`,
					);
				}
				return {
					coordinator,
					sheetKey: definition.sheetKey,
					formulaName: definition.formulaName,
				};
			}

			const duplicateByName = sheetKeysByFormulaName.get(definition.formulaName);
			if (duplicateByName && duplicateByName !== definition.sheetKey) {
				throw new Error(
					`Workbook formula name "${definition.formulaName}" is already used by sheet "${duplicateByName}".`,
				);
			}

			const sheetId = ensureSheetId(definition.formulaName);
			sheets.set(definition.sheetKey, {
				sheetKey: definition.sheetKey,
				formulaName: definition.formulaName,
				sheetId,
				controller: null,
				getCells: null,
				lastKnownCells: [],
			});
			sheetKeysByFormulaName.set(definition.formulaName, definition.sheetKey);

			return {
				coordinator,
				sheetKey: definition.sheetKey,
				formulaName: definition.formulaName,
			};
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		getController(sheetKey) {
			return sheets.get(sheetKey)?.controller ?? null;
		},

		insertReference,

		setReferenceHighlight(sheetKey, range) {
			getSheetRuntime(sheetKey).controller?.setReferenceHighlight(range);
		},

		clearReferenceHighlights,

		insertRows(sheetKey, atIndex, count) {
			if (count <= 0) return null;
			const runtime = getSheetRuntime(sheetKey);
			syncRegisteredSheetsToEngine();
			if (!hf.isItPossibleToAddRows(runtime.sheetId, [atIndex, count])) {
				return null;
			}

			return applyStructuralOperation(
				{ type: "insertRows", sheetKey, atIndex, count },
				() => {
					hf.addRows(runtime.sheetId, [atIndex, count]);
				},
			);
		},

		deleteRows(sheetKey, atIndex, count) {
			if (count <= 0) return null;
			const runtime = getSheetRuntime(sheetKey);
			syncRegisteredSheetsToEngine();
			if (!hf.isItPossibleToRemoveRows(runtime.sheetId, [atIndex, count])) {
				return null;
			}

			return applyStructuralOperation(
				{ type: "deleteRows", sheetKey, atIndex, count },
				() => {
					hf.removeRows(runtime.sheetId, [atIndex, count]);
				},
			);
		},

		setRowOrder(sheetKey, indexOrder) {
			const runtime = getSheetRuntime(sheetKey);
			syncRegisteredSheetsToEngine();
			if (!hf.isItPossibleToSetRowOrder(runtime.sheetId, indexOrder)) {
				return null;
			}

			return applyStructuralOperation(
				{ type: "setRowOrder", sheetKey, indexOrder: [...indexOrder] },
				() => {
					hf.setRowOrder(runtime.sheetId, indexOrder);
				},
			);
		},

		undo() {
			if (historyIndex <= 0) return null;
			historyIndex -= 1;
			return restoreSnapshots({ type: "undo" }, history[historyIndex]!.before);
		},

		redo() {
			if (historyIndex >= history.length) return null;
			const entry = history[historyIndex]!;
			historyIndex += 1;
			return restoreSnapshots({ type: "redo" }, entry.after);
		},

		canUndo() {
			return historyIndex > 0;
		},

		canRedo() {
			return historyIndex < history.length;
		},

		[workbookCoordinatorInternals]: internals,
	};

	return coordinator;
}
