import { Sheet } from "peculiar-sheets";
import type { ColumnDef, CellValue } from "peculiar-sheets";
import { ReplayHost, type ReplayHostHandle } from "../player/ReplayHost";

// Undo/redo is built-in — no props required.
// Ctrl+Z undoes, Ctrl+Y redoes.
// Batch operations (paste, autofill) count as a single history step.

const columns: ColumnDef[] = [
  { id: "a", header: "Col A", width: 120, editable: true },
  { id: "b", header: "Col B", width: 120, editable: true },
];

const data: CellValue[][] = [
  ["original", 100],
  ["untouched", 200],
];

export interface HistorySheetProps {
  /** Called once the replay host has mounted. Forwards the controller + buffer
   * up to the parent `ScenarioPlayer`, which drives scenarios against this
   * `<Sheet>` without touching `window.*` globals. */
  onReplayReady?: (handle: ReplayHostHandle) => void;
}

export default function HistorySheet(props: HistorySheetProps = {}) {
  return (
    <ReplayHost initialData={data} columns={columns} onReady={props.onReplayReady}>
      {({ data: liveData, bindings, ref }) => (
        <Sheet
          data={liveData()}
          columns={columns}
          onOperation={bindings.onOperation}
          ref={ref}
        />
      )}
    </ReplayHost>
  );
}
