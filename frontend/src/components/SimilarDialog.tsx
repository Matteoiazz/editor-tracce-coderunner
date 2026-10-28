import { useEffect, useRef, useState } from "react";
import { inputSummary } from "../review";
import { type SimilarExercises, similarSummary } from "../similar";
import { IconCheck, IconPlus } from "./icons";

interface Props {
  result: SimilarExercises;
  /** Per indice della proposta, il nome dell'esercizio già creato. */
  added: Record<number, string>;
  /** Crea l'esercizio nella traccia aperta. */
  onAdd: (index: number) => Promise<void>;
  onDiscard: () => void;
  onClose: () => void;
}

/** Esercizi simili proposti dal modello, già controllati sugli input dei test comuni. Ognuno si
 *  aggiunge all'esame con un clic e poi si modifica come gli altri. */
export function SimilarDialog({ result, added, onAdd, onDiscard, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [adding, setAdding] = useState<number | null>(null);
  useEffect(() => dialogRef.current?.showModal(), []);

  async function add(index: number) {
    setAdding(index);
    try {
      await onAdd(index);
    } finally {
      setAdding(null);
    }
  }

  return (
    <dialog ref={dialogRef} className="generator-dialog fix-dialog" onClose={onClose} aria-labelledby="simili-titolo">
      <div className="fix-body">
        <h2 id="simili-titolo">Esercizi simili</h2>
        <p className="small-text muted">
          {similarSummary(result)}. Ogni proposta è stata eseguita sugli input dei test comuni senza
          errori e dà risultati diversi dall'esercizio di partenza. Controlla testo e soluzione prima
          di usarla.
        </p>

        <ul className="similar-list">
          {result.proposals.map((proposal, index) => (
            <li key={`${proposal.title}-${index}`} className="similar-item">
              <div className="similar-head">
                <h3>{proposal.title}</h3>
                {added[index] ? (
                  <span className="suggested-added small-text">
                    <IconCheck /> Aggiunto come {added[index]}
                  </span>
                ) : (
                  <button type="button" className="secondary small" disabled={adding !== null} onClick={() => add(index)}>
                    <IconPlus /> {adding === index ? "Aggiunta…" : "Aggiungi all'esame"}
                  </button>
                )}
              </div>
              <p className="similar-text">{proposal.text}</p>
              <details>
                <summary className="small-text">Soluzione</summary>
                <pre className="mono similar-code">{proposal.solution}</pre>
              </details>
              {proposal.samples.length > 0 && (
                <details>
                  <summary className="small-text">Esempi di output</summary>
                  <div className="similar-samples">
                    {proposal.samples.map((sample) => (
                      <div key={sample.stdin}>
                        <code className="mono small-text">{inputSummary(sample.stdin)}</code>
                        <pre className="mono similar-code">{sample.output}</pre>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>

        <div className="generator-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              onDiscard();
              dialogRef.current?.close();
            }}
          >
            Scarta le proposte
          </button>
          <button type="button" className="primary" onClick={() => dialogRef.current?.close()}>
            Chiudi
          </button>
        </div>
      </div>
    </dialog>
  );
}
