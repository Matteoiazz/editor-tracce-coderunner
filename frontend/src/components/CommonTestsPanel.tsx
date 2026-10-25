import { useState } from "react";
import { newRow, nextSeedInput, standardCommonTests, type TestRow } from "../testcases";
import { IconPlus } from "./icons";
import { TestCaseTable } from "./TestCaseTable";
import { TestGeneratorDialog } from "./TestGeneratorDialog";

interface Props {
  rows: TestRow[];
  onChange: (rows: TestRow[]) => void;
}

/** Test comuni a tutti gli esercizi dell'esame: solo input e opzioni.
 *  Gli output attesi sono calcolati in ogni esercizio con la sua soluzione. */
export function CommonTestsPanel({ rows, onChange }: Props) {
  const [generating, setGenerating] = useState(false);

  function insertStandard() {
    if (rows.length && !window.confirm("Sostituire i test comuni con i 9 test standard?")) return;
    onChange(standardCommonTests());
  }

  return (
    <article className="common-view">
      <header className="view-head">
        <h1>Test comuni</h1>
        <p className="view-lede">
          Input e opzioni usati da ogni esercizio con «Usa i test comuni» attivo. Gli output si
          calcolano in ciascun esercizio, con la sua soluzione.
        </p>
      </header>
      <div className="view-actions">
        <button type="button" className="secondary" onClick={insertStandard}>
          Inserisci i 9 test standard
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => setGenerating(true)}
          title="Crea test con seed consecutivi su un intervallo di dimensioni"
        >
          Genera test…
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => onChange([...rows, newRow(nextSeedInput(rows))])}
        >
          <IconPlus /> Aggiungi test comune
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">
          Nessun test comune. I 9 test standard sono quelli usati dal docente nell'esame e nel
          pretest di luglio 2026: seed da 0 a 8 con dimensioni crescenti. Con «Genera test…» se ne
          creano quanti servono su un intervallo di dimensioni.
        </p>
      ) : (
        <TestCaseTable rows={rows} startNumber={1} showExpected={false} onChange={onChange} />
      )}
      {generating && (
        <TestGeneratorDialog rows={rows} onGenerate={onChange} onClose={() => setGenerating(false)} />
      )}
    </article>
  );
}
