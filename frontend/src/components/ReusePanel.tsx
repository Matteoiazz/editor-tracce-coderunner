import { useEffect, useState } from "react";
import { searchExercises } from "../api";
import { type ExerciseMatch, trackLabel } from "../archive";
import { IconChevron, IconPlus } from "./icons";

interface Props {
  /** Traccia aperta: i suoi esercizi non compaiono tra i risultati. */
  currentTrackId: string;
  /** Motivo per cui non si possono aggiungere esercizi (es. pretest), oppure null. */
  blockedReason: string | null;
  onAdd: (match: ExerciseMatch) => Promise<void>;
  onError: (message: string) => void;
}

// Attesa dopo l'ultimo tasto prima di cercare
const SEARCH_DELAY_MS = 250;

/** Ricerca negli esercizi delle altre tracce, per copiarne uno nella traccia aperta. */
export function ReusePanel({ currentTrackId, blockedReason, onAdd, onError }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ExerciseMatch[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchExercises(query, currentTrackId);
        if (!cancelled) setMatches(found);
      } catch (e) {
        if (!cancelled) onError(`Ricerca non riuscita: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, currentTrackId, onError]);

  async function add(match: ExerciseMatch) {
    setBusy(true);
    try {
      await onAdd(match);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="reuse-view">
      <header className="view-head">
        <h1>Aggiungi da archivio</h1>
        <p className="view-lede">
          Cerca un esercizio delle tracce salvate e copialo nella traccia aperta: testo,
          soluzione, codice per gli studenti, test e tag. L'originale non cambia.
        </p>
      </header>

      <input
        type="search"
        className="reuse-search"
        placeholder="Cerca nel testo, nel nome o nei tag (es. matrice, ricorsione)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Cerca negli esercizi dell'archivio"
        autoFocus
      />
      {blockedReason && <p className="inline-notice">{blockedReason}.</p>}

      {matches === null ? (
        <p className="empty-state">Ricerca…</p>
      ) : matches.length === 0 ? (
        <p className="empty-state">
          {query.trim()
            ? "Nessun esercizio contiene queste parole."
            : "Nessun esercizio nelle altre tracce dell'archivio."}
        </p>
      ) : (
        <ul className="archive-list">
          {matches.map((m) => {
            const key = `${m.track_id}/${m.position}`;
            const open = expanded === key;
            return (
              <li key={key} className="archive-row reuse-row">
                <div className="archive-info">
                  <span className="archive-title">
                    {m.number !== null ? `Esercizio ${m.number}` : "Esercizio"}
                    <span className="reuse-origin">
                      {trackLabel({ kind: m.track_kind, day: m.track_day, number: m.track_number })}
                    </span>
                  </span>
                  {m.tags.length > 0 && (
                    <span className="archive-meta">Tag: {m.tags.join(", ")}</span>
                  )}
                  <p className={open ? "reuse-text open" : "reuse-text"}>
                    {m.text || "Testo vuoto"}
                  </p>
                </div>
                <div className="archive-actions">
                  <button
                    type="button"
                    className={`ghost small toggle${open ? " open" : ""}`}
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : key)}
                  >
                    <IconChevron size={14} /> {open ? "Riduci" : "Testo completo"}
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy || blockedReason !== null}
                    onClick={() => add(m)}
                  >
                    <IconPlus /> Aggiungi alla traccia
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
