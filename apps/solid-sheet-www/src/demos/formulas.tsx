import HyperFormula from "hyperformula";
import { Sheet } from "peculiar-sheets";
import type { ColumnDef, CellValue } from "peculiar-sheets";
import { ReplayHost, type ReplayHostHandle } from "../player/ReplayHost";

const hf = HyperFormula.buildEmpty({ licenseKey: "gpl-v3" });
const sheetName = hf.addSheet("formulas");
const sheetId = hf.getSheetId(sheetName)!;

const columns: ColumnDef[] = [
  { id: "a", header: "A", width: 100, editable: true },
  { id: "b", header: "B", width: 100, editable: true },
  { id: "c", header: "C", width: 140, editable: true },
];

const data: CellValue[][] = [
  [10, 20, "=A1+B1"],
  [30, 40, "=A2+B2"],
  [50, 60, "=A3+B3"],
  [null, null, "=SUM(C1:C3)"],
];

export interface FormulasSheetProps {
  /** Called once the replay host has mounted. Forwards the controller + buffer
   * up to the parent `ScenarioPlayer`, which drives scenarios against this
   * `<Sheet>` without touching `window.*` globals. */
  onReplayReady?: (handle: ReplayHostHandle) => void;
}

export default function FormulasSheet(props: FormulasSheetProps = {}) {
  return (
    <ReplayHost initialData={data} columns={columns} onReady={props.onReplayReady}>
      {({ data: liveData, bindings, ref }) => (
        <Sheet
          data={liveData()}
          columns={columns}
          formulaEngine={{ instance: hf, sheetId, sheetName }}
          showFormulaBar
          showReferenceHeaders
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
