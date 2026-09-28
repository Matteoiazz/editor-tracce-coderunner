import { newRow, nextSeedInput, standardCommonTests, type TestRow } from "../testcases";
import { TestCaseTable } from "./TestCaseTable";

interface Props {
  rows: TestRow[];
  onChange: (rows: TestRow[]) => void;
}

/** Test comuni a tutti gli esercizi dell'esame: solo input e opzioni.
 *  Gli output attesi sono calcolati in ogni esercizio con la sua soluzione. */
export function CommonTestsPanel({ rows, onChange }: Props) {
  function insertStandard() {
    if (rows.length && !window.confirm("Sostituire i test comuni con i 9 test standard?")) return;
    onChange(standardCommonTests());
  }

  return (
    <section className="common-tests">
      <div className="section-title">
        <h2>Test comuni all'esame</h2>
        <div className="actions">
          <button type="button" onClick={insertStandard}>
            Inserisci i test standard
          </button>
          <button type="button" onClick={() => onChange([...rows, newRow(nextSeedInput(rows))])}>
            + Aggiungi test comune
          </button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="muted">
          Nessun test comune. Gli input inseriti qui vengono usati da tutti gli esercizi che hanno
          «Usa i test comuni» attivo.
        </p>
      ) : (
        <TestCaseTable rows={rows} startNumber={1} showExpected={false} onChange={onChange} />
      )}
    </section>
  );
}
