import { useEffect, useRef, useState } from "react";
import { fillExpected, verifyQuestion } from "../api";
import { type EditableQuestion, unsupportedReason } from "../exam";
import {
  byId,
  composeTests,
  inputLineCount,
  missingInputMessage,
  newRow,
  nextSeedInput,
  outcomesById,
  requiredInputLines,
  type TestRow,
  toTestCase,
} from "../testcases";
import type { TestOutcome } from "../types";
import { TestCaseTable } from "./TestCaseTable";

const CHANGED_DURING_RUN =
  "La soluzione o i test sono cambiati durante l'esecuzione: risultato scartato, ripeti l'operazione.";

interface Props {
  item: EditableQuestion;
  common: TestRow[];
  onUpdate: (change: (item: EditableQuestion) => EditableQuestion) => void;
}

/** Test di un esercizio: test comuni (con gli output di questo esercizio) e test specifici. */
export function TestsSection({ item, common, onUpdate }: Props) {
  const [outcomes, setOutcomes] = useState<Record<string, TestOutcome> | null>(null);
  const [busy, setBusy] = useState<"calcola" | "verifica" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const composed = composeTests(common, item.useCommon, item.commonExpected, item.specific);
  const commonRows = composed.slice(0, item.useCommon ? common.length : 0);
  const unsupported = unsupportedReason(item.question, composed);
  const requiredLines = requiredInputLines(item.question.solution);
  const incomplete = missingInputMessage(
    composed.flatMap((row, i) => (inputLineCount(row.stdin) < requiredLines ? [i + 1] : [])),
    requiredLines,
  );

  // Versione di soluzione e test: un risultato arrivato dopo una modifica va scartato
  const version = useRef(0);

  // Un cambiamento della soluzione o dei test rende non più validi gli esiti mostrati
  useEffect(() => {
    version.current += 1;
    setOutcomes(null);
  }, [item.question.solution, item.specific, item.useCommon, item.commonExpected, common]);

  function questionWithTests() {
    return { ...item.question, testcases: composed.map(toTestCase) };
  }

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
    const started = version.current;
    try {
      const result = await fillExpected(questionWithTests());
      if (version.current !== started) {
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
    const started = version.current;
    try {
      const results = await verifyQuestion(questionWithTests());
      if (version.current !== started) {
        setError(CHANGED_DURING_RUN);
        return;
      }
      setOutcomes(outcomesById(composed, results));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const passedAmong = (rows: TestRow[]) => rows.filter((row) => outcomes?.[row.id]?.passed).length;

  return (
    <div className="tests-section">
      <div className="section-title">
        <h3>Test case</h3>
        <div className="actions">
          <button
            type="button"
            onClick={handleFillExpected}
            disabled={busy !== null || unsupported !== null}
          >
            {busy === "calcola" ? "Esecuzione…" : "Calcola output"}
          </button>
          <button
            type="button"
            onClick={handleVerify}
            disabled={busy !== null || unsupported !== null}
          >
            {busy === "verifica" ? "Esecuzione…" : "Verifica"}
          </button>
        </div>
      </div>
      {unsupported && (
        <p className="notice">
          Esercizio non eseguibile dall'applicazione: {unsupported}. Calcola output e Verifica
          sono disattivati; all'esportazione l'esercizio viene riportato così com'è.
        </p>
      )}
      {error && <p className="error">{error}</p>}

      <label className="use-common">
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

      {item.useCommon &&
        (common.length === 0 ? (
          <p className="muted">Nessun test comune definito nell'esame.</p>
        ) : (
          <details className="common-summary">
            <summary>
              Test comuni ({common.length})
              {outcomes && (
                <span className={passedAmong(commonRows) === common.length ? "pass" : "fail"}>
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

      <div className="tests-footer">
        <button
          type="button"
          onClick={() =>
            onUpdate((current) => ({
              ...current,
              specific: [...current.specific, newRow(nextSeedInput(composed))],
            }))
          }
        >
          + Aggiungi test
        </button>
        {outcomes && (
          <span className={passedAmong(composed) === composed.length ? "pass" : "fail"}>
            Totale: {passedAmong(composed)}/{composed.length} superati
          </span>
        )}
      </div>
    </div>
  );
}
