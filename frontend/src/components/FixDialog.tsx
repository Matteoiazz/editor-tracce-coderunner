import { DiffEditor } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { comparisonSummary, type Fix, type Finding, inputSummary } from "../review";

interface Props {
  finding: Finding;
  fix: Fix;
  /** La soluzione su cui è stata chiesta la correzione. */
  original: string;
  /** La soluzione è cambiata dopo la richiesta: la correzione si basa su una versione vecchia. */
  outdated: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

/** Correzione proposta dal modello: differenze rispetto alla soluzione attuale e confronto
 *  degli output su tutti i test. Si applica solo su conferma. */
export function FixDialog({ finding, fix, original, outdated, onApply, onDiscard, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);
  const changed = fix.tests.filter((t) => !t.same);

  const result = (output: string, error: string) =>
    error ? <pre className="mono fix-error">{error}</pre> : <pre className="mono">{output}</pre>;

  return (
    <dialog ref={dialogRef} className="generator-dialog fix-dialog" onClose={onClose} aria-labelledby="correzione-titolo">
      <div className="fix-body">
        <h2 id="correzione-titolo">Correzione proposta · {finding.title}</h2>
        {fix.explanation && <p>{fix.explanation}</p>}

        <div className="fix-diff-head small-text muted">
          <span>Soluzione attuale</span>
          <span>Soluzione corretta</span>
        </div>
        <div className="fix-diff">
          <DiffEditor
            height={360}
            language="python"
            original={original}
            modified={fix.solution}
            options={{
              readOnly: true,
              originalEditable: false,
              renderSideBySide: true,
              minimap: { enabled: false },
              fontSize: 13,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              scrollbar: { alwaysConsumeMouseWheel: false },
            }}
          />
        </div>

        <h3 className="settings-label">Confronto sui test</h3>
        <p className={changed.some((t) => t.after_error && !t.before_error) ? "inline-notice" : "small-text"}>
          {comparisonSummary(fix.tests)}
          {changed.length > 0 &&
            " Gli output attesi dei test che cambiano vanno ricalcolati con «Calcola output» dopo aver applicato la correzione."}
        </p>
        {fix.not_compared > 0 && (
          <p className="small-text muted">
            {fix.not_compared === 1
              ? "Un altro test non è stato confrontato"
              : `Altri ${fix.not_compared} test non sono stati confrontati`}
            : il confronto si ferma dopo un numero massimo di test, o prima se la soluzione corretta
            si interrompe (tempo limite o output eccessivo). Dopo aver applicato la correzione,
            «Calcola output» li esegue tutti.
          </p>
        )}
        {changed.length > 0 && (
          <ul className="fix-tests">
            {changed.map((t) => (
              <li key={t.stdin}>
                <code className="mono">{inputSummary(t.stdin)}</code>
                <div className="fix-compare">
                  <div>
                    <span className="small-text muted">Prima</span>
                    {result(t.before, t.before_error)}
                  </div>
                  <div>
                    <span className="small-text muted">Dopo</span>
                    {result(t.after, t.after_error)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {outdated && (
          <p className="inline-notice">
            La soluzione è cambiata dopo la richiesta: questa correzione si basa sulla versione
            precedente. Scartala e chiedine una nuova.
          </p>
        )}

        <div className="generator-actions">
          <button type="button" className="ghost" onClick={() => dialogRef.current?.close()}>
            Decido dopo
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              onDiscard();
              dialogRef.current?.close();
            }}
          >
            Scarta
          </button>
          <button
            type="button"
            className="primary"
            disabled={outdated}
            onClick={() => {
              onApply();
              dialogRef.current?.close();
            }}
          >
            Applica la correzione
          </button>
        </div>
      </div>
    </dialog>
  );
}
