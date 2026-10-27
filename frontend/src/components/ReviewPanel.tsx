import {
  inputSummary,
  KIND_LABELS,
  type ReviewEntry,
  reviewSummary,
  sortedFindings,
} from "../review";
import { IconCheck, IconClose, IconPlus } from "./icons";

interface Props {
  entry: ReviewEntry;
  /** Testo o soluzione sono cambiati dopo la revisione. */
  stale: boolean;
  onRetry: () => void;
  onClose: () => void;
  onDismiss: (index: number) => void;
  /** Aggiunge ai test specifici i test suggeriti con questi indici. */
  onAddTests: (indexes: number[]) => void;
}

/** Esito della revisione della soluzione, sotto l'editor della soluzione. Le segnalazioni sono
 *  ipotesi del modello; i test suggeriti sono già stati eseguiti sulla soluzione. */
export function ReviewPanel({ entry, stale, onRetry, onClose, onDismiss, onAddTests }: Props) {
  const head = (summary: string | null) => (
    <div className="review-head">
      <h3>Revisione dell'AI</h3>
      {summary && <span className="small-text muted">{summary}</span>}
      <div className="section-actions">
        {entry.state !== "pending" && (
          <button type="button" className="ghost small" onClick={onRetry}>
            Ripeti
          </button>
        )}
        <button type="button" className="ghost small" onClick={onClose} title="Chiudi la revisione">
          <IconClose /> Chiudi
        </button>
      </div>
    </div>
  );

  if (entry.state === "pending") {
    return (
      <div className="review" role="status">
        {head(null)}
        <p className="muted">
          Revisione in corso: il modello legge testo, soluzione e test. Con i modelli gratuiti può
          volerci qualche minuto; intanto puoi continuare a lavorare.
        </p>
      </div>
    );
  }

  if (entry.state === "error") {
    return (
      <div className="review">
        {head(null)}
        <p className="inline-notice" role="alert">
          Revisione non riuscita: {entry.message}.
        </p>
      </div>
    );
  }

  const { review, dismissed, added } = entry;
  const findings = sortedFindings(review.findings).filter(({ index }) => !dismissed.includes(index));
  // Prima i test su cui la soluzione va in errore: sono problemi certi, non ipotesi
  const tests = review.tests
    .map((test, index) => ({ test, index }))
    .sort((a, b) => Number(!a.test.error) - Number(!b.test.error));
  const addable = tests.filter(({ test, index }) => !test.error && !added.includes(index));

  return (
    <div className="review">
      {head(reviewSummary(review))}

      {stale && (
        <p className="inline-notice">
          Testo o soluzione sono cambiati dopo la revisione: le segnalazioni potrebbero non valere
          più. Premi «Ripeti» per aggiornarla.
        </p>
      )}

      {findings.length > 0 && (
        <ul className="review-findings">
          {findings.map(({ finding, index }) => (
            <li key={index} className={`finding finding-${finding.kind}`}>
              <div className="finding-head">
                <span className="finding-kind">{KIND_LABELS[finding.kind]}</span>
                <strong>{finding.title}</strong>
                {finding.line !== null && <span className="mono small-text muted">riga {finding.line}</span>}
                <button type="button" className="ghost small finding-dismiss" onClick={() => onDismiss(index)}>
                  Ignora
                </button>
              </div>
              {finding.explanation && <p className="finding-text">{finding.explanation}</p>}
            </li>
          ))}
        </ul>
      )}
      {dismissed.length > 0 && (
        <p className="small-text muted">
          {dismissed.length === 1 ? "1 segnalazione ignorata" : `${dismissed.length} segnalazioni ignorate`}
        </p>
      )}

      {tests.length > 0 && (
        <>
          <div className="review-tests-head">
            <h4 className="settings-label">Test suggeriti</h4>
            {addable.length > 1 && (
              <button type="button" className="secondary small" onClick={() => onAddTests(addable.map((t) => t.index))}>
                <IconPlus /> Aggiungi tutti ({addable.length})
              </button>
            )}
          </div>
          <ul className="review-tests">
            {tests.map(({ test, index }) => (
              <li key={index} className={test.error ? "suggested-test failed" : "suggested-test"}>
                <div className="suggested-test-head">
                  <code className="mono">{inputSummary(test.stdin)}</code>
                  {test.reason && <span className="small-text">{test.reason}</span>}
                  {!test.error &&
                    (added.includes(index) ? (
                      <span className="suggested-added small-text">
                        <IconCheck /> Aggiunto ai test
                      </span>
                    ) : (
                      <button type="button" className="ghost small" onClick={() => onAddTests([index])}>
                        <IconPlus /> Aggiungi ai test
                      </button>
                    ))}
                </div>
                {test.error ? (
                  <p className="inline-error">La soluzione va in errore con questo input:{"\n"}{test.error}</p>
                ) : (
                  <details className="suggested-output">
                    <summary className="small-text">Output della soluzione</summary>
                    <pre className="mono">{test.output}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="small-text muted review-note">
        Testo, soluzione e input dei test sono stati inviati al modello tramite OpenRouter. Le
        segnalazioni sono ipotesi da valutare; gli output dei test suggeriti vengono dalla tua
        soluzione.
      </p>
    </div>
  );
}
