import { useState } from "react";
import { HIDDEN, inputLineCount, type TestRow, VISIBLE } from "../testcases";
import type { TestOutcome } from "../types";
import { IconCheck, IconChevron, IconClose, IconCross } from "./icons";

interface Props {
  rows: TestRow[];
  /** Numero del primo test: la numerazione è continua come su Moodle. */
  startNumber: number;
  showExpected: boolean;
  outcomes?: Record<string, TestOutcome> | null;
  /** Se assente la tabella è in sola lettura. */
  onChange?: (rows: TestRow[]) => void;
  /** Righe di input lette dalla soluzione: i test con meno righe vengono evidenziati. */
  requiredLines?: number;
  /** Test comuni che l'esercizio non usa, per identificativo. Con `onExcludedChange` la
   *  tabella ha la colonna «Usa» per includerli o escluderli. */
  excluded?: string[];
  onExcludedChange?: (id: string, excluded: boolean) => void;
}

const PREVIEW_LENGTH = 60;

/** Tabella dei test case: input, opzioni di CodeRunner, output atteso ed esito. */
export function TestCaseTable(props: Props) {
  const { rows, startNumber, showExpected, outcomes, onChange, requiredLines = 0 } = props;
  const { excluded = [], onExcludedChange } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const editable = onChange !== undefined;
  const selectable = onExcludedChange !== undefined;
  const columns =
    5 + (showExpected ? 1 : 0) + (outcomes ? 1 : 0) + (editable ? 1 : 0) + (selectable ? 1 : 0);
  // Numeri come su Moodle: i test esclusi non vengono esportati e non hanno numero
  let next = startNumber;
  const numbers = rows.map((row) => (excluded.includes(row.id) ? null : next++));

  function update(id: string, changes: Partial<TestRow>) {
    onChange?.(rows.map((row) => (row.id === id ? { ...row, ...changes } : row)));
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    // Nelle finestre strette la tabella scorre in orizzontale invece di uscire dal bordo
    <div className="table-scroll">
    <table className="test-table">
      <thead>
        <tr>
          <th className="col-number">#</th>
          {selectable && (
            <th className="col-use" title="Togli la spunta ai test comuni che questo esercizio non deve usare">
              Usa
            </th>
          )}
          <th
            className="col-input"
            title="Ogni valore letto dalla soluzione con input() va su una riga diversa"
          >
            Input (un valore per riga)
          </th>
          {showExpected && <th className="col-expected">Output atteso</th>}
          <th className="col-option" title="Mostrato allo studente come esempio sotto il testo">
            Esempio
          </th>
          <th
            className="col-option"
            title="Se lo studente fallisce questo test, i successivi non vengono mostrati"
          >
            Nascondi succ.
          </th>
          <th className="col-display">Visibilità</th>
          {outcomes && <th className="col-outcome">Esito</th>}
          {editable && <th className="col-delete" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const off = excluded.includes(row.id);
          const outcome = off ? undefined : outcomes?.[row.id];
          const missing = off ? 0 : requiredLines - inputLineCount(row.stdin);
          return [
            <tr key={row.id} className={off ? "excluded" : undefined}>
              <td className="number">{numbers[i] ?? "–"}</td>
              {selectable && (
                <td className="center">
                  <input
                    type="checkbox"
                    checked={!off}
                    aria-label={`Usa il test comune con input ${row.stdin.split("\n").join(" ")}`}
                    onChange={(e) => onExcludedChange(row.id, !e.target.checked)}
                  />
                </td>
              )}
              <td>
                <textarea
                  className={missing > 0 ? "stdin incomplete" : "stdin"}
                  rows={Math.max(2, row.stdin.split("\n").length)}
                  value={row.stdin}
                  placeholder={"seed\ndimensione"}
                  readOnly={!editable}
                  // Un input modificato rende non più valido l'output atteso
                  onChange={(e) => update(row.id, { stdin: e.target.value, expected: "" })}
                />
                {missing > 0 && (
                  <div className="input-warning">
                    {missing === 1 ? "Manca 1 valore" : `Mancano ${missing} valori`}: la soluzione
                    ne legge {requiredLines}, uno per riga
                  </div>
                )}
              </td>
              {showExpected && (
                <td className="expected">
                  {off ? (
                    <span className="muted">non usato da questo esercizio</span>
                  ) : (
                  <ExpectedCell
                    text={row.expected}
                    expanded={expanded.has(row.id)}
                    onToggle={() => toggle(row.id)}
                  />
                  )}
                </td>
              )}
              <td className="center">
                <input
                  type="checkbox"
                  checked={row.use_as_example}
                  disabled={!editable}
                  onChange={(e) => update(row.id, { use_as_example: e.target.checked })}
                />
              </td>
              <td className="center">
                <input
                  type="checkbox"
                  checked={row.hide_rest_if_fail}
                  disabled={!editable}
                  onChange={(e) => update(row.id, { hide_rest_if_fail: e.target.checked })}
                />
              </td>
              <td>
                <select
                  value={row.display}
                  disabled={!editable}
                  onChange={(e) => update(row.id, { display: e.target.value })}
                >
                  <option value={VISIBLE}>Visibile</option>
                  <option value={HIDDEN}>Nascosto</option>
                  {row.display !== VISIBLE && row.display !== HIDDEN && (
                    <option value={row.display}>Come da Moodle</option>
                  )}
                </select>
              </td>
              {outcomes && <td className="center">{outcome && <OutcomeBadge outcome={outcome} />}</td>}
              {editable && (
                <td className="center">
                  <button
                    type="button"
                    className="icon"
                    title="Elimina test"
                    aria-label={`Elimina il test ${numbers[i] ?? ""}`}
                    onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  >
                    <IconClose />
                  </button>
                </td>
              )}
            </tr>,
            outcome && !outcome.passed && (
              <tr key={`${row.id}-detail`} className="detail">
                <td colSpan={columns}>
                  {outcome.error ? (
                    <pre className="error-output">{outcome.error}</pre>
                  ) : (
                    <div className="comparison">
                      <div>
                        <strong>Atteso</strong>
                        <pre>{outcome.expected}</pre>
                      </div>
                      <div>
                        <strong>Ottenuto</strong>
                        <pre>{outcome.got}</pre>
                      </div>
                    </div>
                  )}
                </td>
              </tr>
            ),
          ];
        })}
      </tbody>
    </table>
    </div>
  );
}

function ExpectedCell(props: { text: string; expanded: boolean; onToggle: () => void }) {
  const { text, expanded, onToggle } = props;
  if (!text) return <span className="muted">da calcolare</span>;
  const oneLine = text.trim().split("\n").join(" ");
  const long = oneLine.length > PREVIEW_LENGTH || text.trim().includes("\n");
  return (
    <div className="expected-cell">
      {long && (
        <button
          type="button"
          className={`icon toggle${expanded ? " open" : ""}`}
          onClick={onToggle}
          title={expanded ? "Riduci" : "Mostra tutto"}
          aria-expanded={expanded}
        >
          <IconChevron size={14} />
        </button>
      )}
      {expanded ? (
        <pre>{text}</pre>
      ) : (
        <code>{oneLine.length > PREVIEW_LENGTH ? `${oneLine.slice(0, PREVIEW_LENGTH)}…` : oneLine}</code>
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: TestOutcome }) {
  if (outcome.passed) {
    return (
      <span className="badge pass">
        <IconCheck size={13} /> superato
      </span>
    );
  }
  return (
    <span className="badge fail">
      <IconCross size={13} /> {outcome.error ? "errore" : "fallito"}
    </span>
  );
}
