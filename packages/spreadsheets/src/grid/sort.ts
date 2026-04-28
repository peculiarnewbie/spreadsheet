import type { SortDirection } from "../types";

export { buildIndexOrder } from "../core/indexOrder";

const SORT_COLLATOR = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base",
});

export function isBlankSortValue(value: string | number | boolean | null): boolean {
	return value === null || value === "";
}

export function getSortTypeOrder(value: string | number | boolean | null): number {
	if (typeof value === "number") return 0;
	if (typeof value === "string") return 1;
	if (typeof value === "boolean") return 2;
	return 3;
}

export function compareSortValues(
	left: string | number | boolean | null,
	right: string | number | boolean | null,
): number {
	if (typeof left === "number" && typeof right === "number") {
		return left - right;
	}

	if (typeof left === "string" && typeof right === "string") {
		return SORT_COLLATOR.compare(left, right);
	}

	if (typeof left === "boolean" && typeof right === "boolean") {
		if (left === right) return 0;
		return left ? 1 : -1;
	}

	return getSortTypeOrder(left) - getSortTypeOrder(right);
}

export function compareSortableEntries(
	left: string | number | boolean | null,
	right: string | number | boolean | null,
	direction: SortDirection,
): number {
	const leftBlank = isBlankSortValue(left);
	const rightBlank = isBlankSortValue(right);

	if (leftBlank && rightBlank) return 0;
	if (leftBlank) return 1;
	if (rightBlank) return -1;

	const comparison = compareSortValues(left, right);
	return direction === "asc" ? comparison : -comparison;
}