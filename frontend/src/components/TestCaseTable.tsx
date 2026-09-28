import { useState } from "react";
import { HIDDEN, type TestRow, VISIBLE } from "../testcases";
import type { TestOutcome } from "../types";

interface Props {
  rows: TestRow[];
  /** Numero del primo test: la numerazione è continua come su Moodle. */
  startNumber: number;
  showExpected: boolean;
  outcomes?: Record<string, TestOutcome> | null;
  /** Se assente la tabella è in sola lettura. */
  onChange?: (rows: TestRow[]) => void;
}

const PREVIEW_LENGTH = 60;

/** Tabella dei test case: input, opzioni di CodeRunner, output atteso ed esito. */
export function TestCaseTable({ rows, startNumber, showExpected, outcomes, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const editable = onChange !== undefined;
  const columns = 5 + (showExpected ? 1 : 0) + (outcomes ? 1 : 0) + (editable ? 1 : 0);

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
    <table className="test-table">
      <thead>
        <tr>
          <th>#</th>
          <th>Input</th>
          {showExpected && <th>Output atteso</th>}
          <th title="Mostrato allo studente come esempio sotto il testo">Esempio</th>
          <th title="Se lo studente fallisce questo test, i successivi non vengono mostrati">
            Nascondi succ.
          </th>
          <th>Visibilità</th>
          {outcomes && <th>Esito</th>}
          {editable && <th />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const outcome = outcomes?.[row.id];
          return [
            <tr key={row.id}>
              <td className="number">{startNumber + i}</td>
              <td>
                <textarea
                  className="stdin"
                  rows={Math.max(2, row.stdin.split("\n").length)}
                  value={row.stdin}
                  readOnly={!editable}
                  // Un input modificato rende non più valido l'output atteso
                  onChange={(e) => update(row.id, { stdin: e.target.value, expected: "" })}
                />
              </td>
              {showExpected && (
                <td className="expected">
                  <ExpectedCell
                    text={row.expected}
                    expanded={expanded.has(row.id)}
                    onToggle={() => toggle(row.id)}
                  />
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
                    onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                  >
                    ✕
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
        <button type="button" className="icon" onClick={onToggle} title="Mostra tutto">
          {expanded ? "▾" : "▸"}
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
  if (outcome.passed) return <span className="badge pass">✓</span>;
  return <span className="badge fail">{outcome.error ? "errore" : "✗"}</span>;
}
