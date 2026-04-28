import { type PhysicalRowIndex, type RowId, physicalRow } from "./brands";

export function buildIndexOrder(oldOrder: RowId[], newOrder: RowId[]): PhysicalRowIndex[] {
    const nextIndexByRowId = new Map<RowId, PhysicalRowIndex>();
    for (const [i, id] of newOrder.entries()) {
        nextIndexByRowId.set(id, physicalRow(i));
    }
    return oldOrder.map((id) => nextIndexByRowId.get(id) ?? physicalRow(-1));
}