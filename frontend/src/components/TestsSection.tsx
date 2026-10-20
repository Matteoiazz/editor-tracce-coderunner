import { useEffect, useRef, useState } from "react";
import { fillExpected, verifyQuestion } from "../api";
import { type EditableQuestion, unsupportedReason } from "../exam";
import type { SectionStatus } from "../status";
import {
  byId,
  composeTests,
  inputLineCount,
  missingInputMessage,
  newRow,
  nextSeedInput,
  requiredInputLines,
  type TestRow,
  toTestCase,
} from "../testcases";
import type { TestOutcome } from "../types";
import { IconCompute, IconPlus, IconRun } from "./icons";
import { SectionStateIcon } from "./SectionState";
import { TestCaseTable } from "./TestCaseTable";

const CHANGED_DURING_RUN =
  "La soluzione o i test sono cambiati durante l'esecuzione: risultato scartato, ripeti l'operazione.";

interface Props {
  item: EditableQuestion;
  common: TestRow[];
  /** Esiti dell'ultima verifica, se ancora validi per soluzione e test attuali. */
  outcomes: Record<string, TestOutcome> | null;
  sectionStatus: SectionStatus;
  onUpdate: (change: (item: EditableQuestion) => EditableQuestion) => void;
  onVerified: (rows: TestRow[], solution: string, outcomes: TestOutcome[]) => void;
}

/** Test di un esercizio: test comuni (con gli output di questo esercizio) e test specifici. */
export function TestsSection({ item, common, outcomes, sectionStatus, onUpdate, onVerified }: Props) {
  const [busy, setBusy] = useState<"calcola" | "verifica" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Vero se gli esiti mostrati sono quelli della verifica fatta subito dopo il calcolo
  const [justComputed, setJustComputed] = useState(false);

  const composed = composeTests(common, item.useCommon, item.commonExpected, item.specific);
  const commonRows = composed.slice(0, item.useCommon ? common.length : 0);
  const unsupported = unsupportedReason(item.question, composed);
  const requiredLines = requiredInputLines(item.question.solution);
  const incomplete = missingInputMessage(
    composed.flatMap((row, i) => (inputLineCount(row.stdin) < requiredLines ? [i + 1] : [])),
    requiredLines,
  );

  // Il calcolo degli output va scartato se soluzione o test cambiano mentre è in corso
  const snapshot = JSON.stringify([item.question.solution, composed.map((r) => [r.id, r.stdin])]);
  const latest = useRef(snapshot);
  latest.current = snapshot;

  function questionWithTests() {
    return { ...item.question, testcases: composed.map(toTestCase) };
  }

  // Test con esito "fallito" perché l'output è diverso (non per un errore della soluzione)
  const mismatched = (rows: TestRow[]) =>
    rows.filter((row) => outcomes?.[row.id] && !outcomes[row.id].passed && !outcomes[row.id].error).length;
  const failedAmong = (rows: TestRow[]) =>
    rows.filter((row) => outcomes?.[row.id] && !outcomes[row.id].passed).length;

  // I test comuni stanno in un riquadro chiuso: si apre da solo se qualcuno fallisce,
  // altrimenti i dettagli dei fallimenti resterebbero nascosti
  const commonFailed = failedAmong(commonRows);
  const [commonOpen, setCommonOpen] = useState(commonFailed > 0);
  useEffect(() => {
    if (commonFailed > 0) setCommonOpen(true);
  }, [outcomes, commonFailed]);

  async function handleFillExpected() {
    setError(null);
    if (composed.length === 0) {
      setError("Aggiungi almeno un test, comune o specifico.");
      return;
    }
    if (incomplete) {
      setError(incomplete);
      return;
    }
    setBusy("calcola");
    const started = snapshot;
    const solution = item.question.solution;
    try {
      const result = await fillExpected(questionWithTests());
      if (latest.current !== started) {
        setError(CHANGED_DURING_RUN);
        return;
      }
      const expected = byId(
        composed,
        result.testcases.map((t) => t.expected),
      );
      const commonIds = new Set(commonRows.map((row) => row.id));
      onUpdate((current) => ({
        ...current,
        commonExpected: {
          ...current.commonExpected,
          ...Object.fromEntries(Object.entries(expected).filter(([id]) => commonIds.has(id))),
        },
        specific: current.specific.map((row) =>
          row.id in expected ? { ...row, expected: expected[row.id] } : row,
        ),
      }));
      // Subito dopo si verificano gli output appena calcolati, così l'esercizio risulta già
      // verificato. Scopre anche una soluzione che dà risultati diversi a ogni esecuzione.
      // Se nel frattempo soluzione o test cambiano, gli esiti scadono da soli.
      const rows = composed.map((row) => ({ ...row, expected: expected[row.id] }));
      const verified = await verifyQuestion({ ...item.question, testcases: rows.map(toTestCase) });
      onVerified(rows, solution, verified);
      setJustComputed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleVerify() {
    setError(null);
    if (composed.length === 0) {
      setError("Aggiungi almeno un test, comune o specifico.");
      return;
    }
    if (composed.some((row) => !row.expected)) {
      setError("Alcuni test non hanno l'output atteso: premi prima «Calcola output».");
      return;
    }
    if (incomplete) {
      setError(incomplete);
      return;
    }
    setBusy("verifica");
    setJustComputed(false);
    // Gli esiti sono legati a soluzione e test di questo momento: se poi cambiano,
    // l'app li considera scaduti da sola.
    const rows = composed;
    const solution = item.question.solution;
    try {
      onVerified(rows, solution, await verifyQuestion(questionWithTests()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const passedAmong = (rows: TestRow[]) => rows.filter((row) => outcomes?.[row.id]?.passed).length;
  const disabled = busy !== null || unsupported !== null;

  return (
    <div className="tests-section">
      <div className="section-head">
        <h2>
          <SectionStateIcon state={sectionStatus.state} />
          Test
        </h2>
        <span className="section-note">{sectionStatus.note}</span>
        <div className="section-actions">
          <button
            type="button"
            className="primary"
            onClick={handleFillExpected}
            disabled={disabled}
            title="Calcola gli output attesi eseguendo la soluzione, poi li verifica"
          >
            <IconCompute /> {busy === "calcola" ? "Calcolo…" : "Calcola output"}
          </button>
          {/* Secondario: serve per gli esercizi importati e per controllare una soluzione
              ritoccata, senza cambiare gli output attesi */}
          <button
            type="button"
            className="secondary"
            onClick={handleVerify}
            disabled={disabled}
            title="Controlla la soluzione sugli output attesi, senza cambiarli"
          >
            <IconRun /> {busy === "verifica" ? "Verifica…" : "Verifica"}
          </button>
        </div>
      </div>

      {unsupported && (
        <p className="inline-notice">
          Esercizio non eseguibile dall'applicazione: {unsupported}. Calcola output e Verifica sono
          disattivati; all'esportazione l'esercizio viene riportato così com'è.
        </p>
      )}
      {error && <p className="inline-error">{error}</p>}
      {mismatched(composed) > 0 && (
        <p className="inline-notice">
          {justComputed
            ? "Ricalcolati subito dopo, gli output sono diversi: la soluzione dà risultati " +
              "diversi a ogni esecuzione (es. numeri casuali senza random.seed, o l'ordine di un " +
              "set di stringhe). Su Moodle anche gli studenti fallirebbero questi test."
            : "Gli output attesi non corrispondono a quelli della soluzione. Se hai modificato " +
              "la soluzione di proposito, premi «Calcola output» per aggiornarli."}
        </p>
      )}

      <div className="tests-toolbar">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={item.useCommon}
            onChange={(e) => {
              const useCommon = e.target.checked;
              onUpdate((current) => ({ ...current, useCommon }));
            }}
          />
          Usa i test comuni
        </label>
        {outcomes && (
          <span className={`tests-total mono ${passedAmong(composed) === composed.length ? "pass" : "fail"}`}>
            {passedAmong(composed)}/{composed.length} superati
          </span>
        )}
      </div>

      {item.useCommon &&
        (common.length === 0 ? (
          <p className="muted small-text">Nessun test comune definito nella traccia.</p>
        ) : (
          <details
            className="common-summary"
            open={commonOpen}
            onToggle={(e) => setCommonOpen(e.currentTarget.open)}
          >
            <summary>
              Test comuni <span className="mono">({common.length})</span>
              {outcomes && (
                <span className={`mono ${passedAmong(commonRows) === common.length ? "pass" : "fail"}`}>
                  {" "}
                  · {passedAmong(commonRows)}/{common.length} superati
                </span>
              )}
            </summary>
            <TestCaseTable
              rows={commonRows}
              startNumber={1}
              showExpected
              outcomes={outcomes}
              requiredLines={requiredLines}
            />
          </details>
        ))}

      {item.specific.length > 0 && (
        <TestCaseTable
          rows={item.specific}
          startNumber={commonRows.length + 1}
          showExpected
          outcomes={outcomes}
          requiredLines={requiredLines}
          onChange={(specific) => onUpdate((current) => ({ ...current, specific }))}
        />
      )}

      <button
        type="button"
        className="ghost add-test"
        onClick={() =>
          onUpdate((current) => ({
            ...current,
            specific: [...current.specific, newRow(nextSeedInput(composed))],
          }))
        }
      >
        <IconPlus /> Aggiungi test
      </button>
    </div>
  );
}
