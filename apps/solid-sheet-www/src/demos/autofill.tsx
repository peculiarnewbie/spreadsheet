import { Sheet } from "peculiar-sheets";
import type { ColumnDef, CellValue } from "peculiar-sheets";
import { ReplayHost, type ReplayHostHandle } from "../player/ReplayHost";

// Autofill is built-in — no props required.
// Select a range, then drag the fill handle (bottom-right corner).
// Numbers detect linear series; text cycles; formulas shift refs.

const columns: ColumnDef[] = [
  { id: "a", header: "Sequence", width: 120, editable: true },
  { id: "b", header: "Labels",   width: 120, editable: true },
  { id: "c", header: "Values",   width: 120, editable: true },
];

const data: CellValue[][] = [
  [1, "alpha", 100],
  [2, "beta",  200],
  [3, "gamma", 300],
  [null, null, null],
  [null, null, null],
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

export interface AutofillSheetProps {
  /** Called once the replay host has mounted. Forwards the controller + buffer
   * up to the parent `ScenarioPlayer`, which drives scenarios against this
   * `<Sheet>` without touching `window.*` globals. */
  onReplayReady?: (handle: ReplayHostHandle) => void;
}

export default function AutofillSheet(props: AutofillSheetProps = {}) {
  return (
    <ReplayHost initialData={data} columns={columns} onReady={props.onReplayReady}>
      {({ data: liveData, bindings, ref }) => (
        <Sheet
          data={liveData()}
          columns={columns}
          onCellEdit={bindings.onCellEdit}
          onBatchEdit={bindings.onBatchEdit}
          onRowInsert={bindings.onRowInsert}
          onRowDelete={bindings.onRowDelete}
          onRowReorder={bindings.onRowReorder}
          ref={ref}
        />
      )}
    </ReplayHost>
  );
}
