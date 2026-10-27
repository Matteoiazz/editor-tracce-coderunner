import { type FormEvent, useEffect, useRef, useState } from "react";
import type { RequestPreview } from "../api";
import { MAX_NOTES } from "../review";

interface Props {
  /** Funzione AI, es. "Revisione della soluzione". */
  action: string;
  /** Prepara la richiesta senza indicazioni aggiuntive (dal backend, senza contattare il modello). */
  loadPreview: () => Promise<RequestPreview>;
  initialNotes: string;
  onSend: (notes: string) => void;
  /** Il docente sceglie di non vedere più la richiesta prima dell'invio. */
  onHideNextTime: () => void;
  onClose: () => void;
}

/** Cosa verrà inviato al modello prima di ogni funzione AI: istruzioni fisse dell'app, dati
 *  dell'esercizio e indicazioni aggiuntive che il docente può scrivere. */
export function AiRequestDialog({ action, loadPreview, initialNotes, onSend, onHideNextTime, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [preview, setPreview] = useState<RequestPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [showNextTime, setShowNextTime] = useState(true);

  useEffect(() => {
    dialogRef.current?.showModal();
    loadPreview().then(setPreview, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!preview) return;
    if (!showNextTime) onHideNextTime();
    onSend(notes.trim());
    dialogRef.current?.close();
  }

  return (
    <dialog ref={dialogRef} className="generator-dialog ai-request-dialog" onClose={onClose} aria-labelledby="richiesta-ai-titolo">
      <form onSubmit={handleSubmit}>
        <h2 id="richiesta-ai-titolo">Richiesta all'AI · {action}</h2>
        <p className="muted small-text">
          Questo è ciò che verrà inviato al modello tramite OpenRouter. Le indicazioni aggiuntive hanno
          la precedenza sulle istruzioni dell'app.
        </p>

        <label className="ai-request-notes">
          <span className="settings-label">Indicazioni aggiuntive (facoltative)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={MAX_NOTES}
            rows={4}
            autoFocus
            placeholder="Es. la lista può essere vuota, non segnalarlo. Controlla soprattutto i numeri negativi."
          />
        </label>

        {error ? (
          <p className="inline-error">{error}</p>
        ) : !preview ? (
          <p className="muted small-text">Preparazione della richiesta…</p>
        ) : (
          <div className="ai-request-parts">
            <details>
              <summary>Istruzioni dell'app</summary>
              <pre className="mono">{preview.system}</pre>
            </details>
            <details>
              <summary>Dati dell'esercizio</summary>
              <pre className="mono">{preview.user}</pre>
            </details>
          </div>
        )}

        <label className="checkbox small-text">
          <input type="checkbox" checked={showNextTime} onChange={(e) => setShowNextTime(e.target.checked)} />
          Mostra la richiesta prima di ogni invio (si può riattivare nelle Impostazioni)
        </label>

        <div className="generator-actions">
          <button type="button" className="ghost" onClick={() => dialogRef.current?.close()}>
            Annulla
          </button>
          <button type="submit" className="primary" disabled={!preview}>
            Invia
          </button>
        </div>
      </form>
    </dialog>
  );
}
