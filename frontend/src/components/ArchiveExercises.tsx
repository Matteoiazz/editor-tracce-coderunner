import { useEffect, useState } from "react";
import { searchExercises } from "../api";
import { type ExerciseMatch, matchesByTrack, trackLabel } from "../archive";
import { IconChevron, IconPlus } from "./icons";

interface Props {
  /** Traccia aperta: i suoi esercizi non compaiono tra i risultati. */
  currentTrackId: string;
  /** Nome della traccia aperta, in cui finiscono gli esercizi aggiunti. */
  currentTitle: string;
  /** Motivo per cui non si possono aggiungere esercizi (es. pretest), oppure null. */
  blockedReason: string | null;
  onAdd: (match: ExerciseMatch) => Promise<void>;
  onError: (message: string) => void;
}

// Attesa dopo l'ultimo tasto prima di cercare
const SEARCH_DELAY_MS = 250;

/** Scheda Esercizi dell'archivio: ricerca negli esercizi delle altre tracce, raggruppati per
 *  traccia, per copiarne uno nella traccia aperta. Gli esercizi senza testo restano nascosti
 *  finché non si chiede di vederli: di solito sono prove lasciate a metà. */
export function ArchiveExercises({ currentTrackId, currentTitle, blockedReason, onAdd, onError }: Props) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ExerciseMatch[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showEmpty, setShowEmpty] = useState(false);
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

  const empty = (matches ?? []).filter((m) => !m.text.trim()).length;
  const shown = (matches ?? []).filter((m) => showEmpty || m.text.trim());

  return (
    <div className="archive-exercises">
      <p className="view-lede">
        Si copiano nella traccia aperta (<strong>{currentTitle}</strong>) testo, soluzione, codice per
        gli studenti, test e tag. L'originale non cambia.
      </p>
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
      ) : shown.length === 0 ? (
        <p className="empty-state">
          {query.trim()
            ? "Nessun esercizio contiene queste parole."
            : "Nessun esercizio nelle altre tracce dell'archivio."}
        </p>
      ) : (
        matchesByTrack(shown).map((group) => {
          const first = group[0];
          return (
            <section key={first.track_id} className="archive-group">
              <h2 className="archive-group-title">
                {trackLabel({ kind: first.track_kind, day: first.track_day, number: first.track_number })}
              </h2>
              <ul className="archive-list">
                {group.map((m) => {
                  const key = `${m.track_id}/${m.position}`;
                  const open = expanded === key;
                  return (
                    <li key={key} className="archive-row reuse-row">
                      <div className="archive-info">
                        <span className="archive-title">
                          {m.number !== null ? `Esercizio ${m.number}` : "Esercizio"}
                          {m.tags.length > 0 && <span className="reuse-origin">{m.tags.join(", ")}</span>}
                        </span>
                        <p className={open ? "reuse-text open" : "reuse-text"}>{m.text || "Testo vuoto"}</p>
                      </div>
                      <div className="archive-actions">
                        {m.text.length > 140 && (
                          <button
                            type="button"
                            className={`ghost small toggle${open ? " open" : ""}`}
                            aria-expanded={open}
                            onClick={() => setExpanded(open ? null : key)}
                          >
                            <IconChevron size={14} /> {open ? "Riduci" : "Testo completo"}
                          </button>
                        )}
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
            </section>
          );
        })
      )}
      {empty > 0 && (
        <button type="button" className="ghost small archive-empty-toggle" onClick={() => setShowEmpty(!showEmpty)}>
          {showEmpty
            ? "Nascondi gli esercizi senza testo"
            : empty === 1
              ? "Mostra anche 1 esercizio senza testo"
              : `Mostra anche ${empty} esercizi senza testo`}
        </button>
      )}
    </div>
  );
}
