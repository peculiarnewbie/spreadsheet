import type { CellValue, ColumnDef } from "peculiar-sheets";
import Harness from "../harness";

// ── Minimal NSLOCTEXT helpers ─────────────────────────────────
// Format used by Unreal for localized strings:
//   NSLOCTEXT("area", "id", "actual text")

interface LocParts {
	area: string;
	id: string;
	text: string;
}
const NSLOC_RE =
	/^NSLOCTEXT\(\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)$/;
function parseNSLoc(raw: CellValue): LocParts | null {
	if (typeof raw !== "string") return null;
	const m = raw.match(NSLOC_RE);
	if (!m) return null;
	return { area: m[1] ?? "", id: m[2] ?? "", text: m[3] ?? "" };
}
function serializeNSLoc(parts: LocParts): string {
	const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	return `NSLOCTEXT("${esc(parts.area)}","${esc(parts.id)}","${esc(parts.text)}")`;
}

// ── Columns exercising every hook ─────────────────────────────

const columns: ColumnDef[] = [
	// Baseline — no hooks.
	{ id: "label", header: "Label", width: 160, editable: true },

	// formatValue + parseValue + getCellTitle (Unreal NSLOCTEXT round-trip).
	{
		id: "localized",
		header: "Localized",
		width: 240,
		editable: true,
		formatValue: (raw) =>
			parseNSLoc(raw)?.text ?? (raw == null ? "" : String(raw)),
		parseValue: (text, { previousValue }) => {
			const prev = parseNSLoc(previousValue);
			if (!prev) return serializeNSLoc({ area: "menu", id: "unknown", text });
			return serializeNSLoc({ ...prev, text });
		},
		getCellTitle: (raw) => {
			const parts = parseNSLoc(raw);
			return parts ? `area: ${parts.area} · id: ${parts.id}` : undefined;
		},
	},

	// renderCell only — a colored status pill.
	{
		id: "status",
		header: "Status",
		width: 140,
		editable: true,
		renderCell: ({ value, isEditing }) => {
			if (isEditing) return null;
			const v = value == null ? "—" : String(value);
			return (
				<span data-testid="status-pill" data-status={v}>
					{v}
				</span>
			);
		},
	},
];

const data: CellValue[][] = [
	["Save Button", 'NSLOCTEXT("menu","btn.save","Save")', "active"],
	["Cancel Button", 'NSLOCTEXT("menu","btn.cancel","Cancel")', "pending"],
	["Delete Button", 'NSLOCTEXT("menu","btn.delete","Delete")', "error"],
	["Open Dialog", 'NSLOCTEXT("dialog","file.open","Open...")', "active"],
];

export default function CustomRenderingPage() {
	return <Harness initialData={data} columns={columns} />;
}
