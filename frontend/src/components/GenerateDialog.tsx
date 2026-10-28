import Editor, { DiffEditor } from "@monaco-editor/react";
import { useEffect, useRef } from "react";
import { attemptsText, type GeneratedSolution, testsSummary } from "../generation";
import { inputSummary } from "../review";

interface Props {
  result: GeneratedSolution;
  /** Soluzione al momento della richiesta: se il docente ne aveva scritta una, si mostrano
   *  le differenze. */
  original: string;
  showDiff: boolean;
  /** La soluzione è cambiata dopo la richiesta. */
  outdated: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

const VIEWER_OPTIONS = {
  readOnly: true,
  minimap: { enabled: false },
  fontSize: 13,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  scrollbar: { alwaysConsumeMouseWheel: false },
};

/** Soluzione generata dal modello, con l'esito dei controlli sui test. Si applica solo su
 *  conferma. */
export function GenerateDialog({ result, original, showDiff, outdated, onApply, onDiscard, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => dialogRef.current?.showModal(), []);
  const failed = result.tests.filter((t) => !t.passed);
  const ok = result.problems.length === 0;

  return (
    <dialog ref={dialogRef} className="generator-dialog fix-dialog" onClose={onClose} aria-labelledby="generata-titolo">
      <div className="fix-body">
        <h2 id="generata-titolo">Soluzione generata</h2>
        <p className={ok ? "small-text" : "inline-notice"}>
          {ok
            ? `${attemptsText(result.attempts)} la soluzione ha superato i controlli dell'app.`
            : `Dopo ${result.attempts} tentativi la soluzione non supera ancora tutti i controlli: controllala prima di applicarla.`}
        </p>
        {result.explanation && <p>{result.explanation}</p>}

        {showDiff && (
          <div className="fix-diff-head small-text muted">
            <span>Soluzione attuale</span>
            <span>Soluzione generata</span>
          </div>
        )}
        <div className="fix-diff">
          {showDiff ? (
            <DiffEditor
              height={380}
              language="python"
              original={original}
              modified={result.solution}
              options={{ ...VIEWER_OPTIONS, originalEditable: false, renderSideBySide: true }}
            />
          ) : (
            <Editor height={380} language="python" value={result.solution} options={VIEWER_OPTIONS} />
          )}
        </div>

        <h3 className="settings-label">Controlli sui test</h3>
        <p className="small-text">{testsSummary(result)}</p>
        {!ok && (
          <ul className="generate-problems small-text">
            {result.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {failed.length > 0 && (
          <ul className="fix-tests">
            {failed.map((t) => (
              <li key={t.stdin}>
                <code className="mono">{inputSummary(t.stdin)}</code>
                <div className="fix-compare">
                  <div>
                    <span className="small-text muted">Atteso</span>
                    <pre className="mono">{t.expected || "(non calcolato)"}</pre>
                  </div>
                  <div>
                    <span className="small-text muted">Ottenuto</span>
                    {t.error ? <pre className="mono fix-error">{t.error}</pre> : <pre className="mono">{t.output}</pre>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {outdated && (
          <p className="inline-notice">
            La soluzione è cambiata dopo la richiesta: applicando questa, le modifiche fatte nel
            frattempo andrebbero perse. Scartala e generane una nuova.
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
            Applica la soluzione
          </button>
        </div>
      </div>
    </dialog>
  );
}
