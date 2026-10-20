import { useEffect, useState } from "react";
import { deleteTrack, emptyTrash, listTracks, restoreTrack } from "../api";
import { formatMoment, sameNameIds, trackLabel, trackYears, type TrackSummary } from "../archive";
import type { ExamKind } from "../naming";
import { IconCopy, IconExport, IconImport, IconRestore, IconTrash } from "./icons";

interface Props {
  /** Traccia aperta in questo momento, evidenziata nell'elenco. */
  currentId: string;
  onOpen: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  /** Importa uno o più file XML del docente come nuove tracce. */
  onImportFiles: () => Promise<void>;
  onBackup: () => Promise<void>;
  onRestore: () => Promise<void>;
  /** Messaggio sull'esito di un'azione svolta qui (ripristino, eliminazione, cestino). */
  onNotice: (message: string) => void;
  /** Chiamata dopo ogni azione: l'elenco delle tracce può essere cambiato. */
  onChanged: () => void;
  onError: (message: string) => void;
}

type Tab = "archive" | "trash";

/** Tracce salvate: apertura, duplicazione e cestino. */
export function ArchivePanel(props: Props) {
  const { currentId, onOpen, onDuplicate, onTrash, onNotice, onChanged, onError } = props;
  const [tab, setTab] = useState<Tab>("archive");
  const [tracks, setTracks] = useState<TrackSummary[] | null>(null);
  const [trash, setTrash] = useState<TrackSummary[]>([]);
  const [kind, setKind] = useState<ExamKind | "">("");
  const [year, setYear] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [inArchive, inTrash] = await Promise.all([listTracks(), listTracks(true)]);
      setTracks(inArchive);
      setTrash(inTrash);
    } catch (e) {
      onError(`Lettura dell'archivio non riuscita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    // L'elenco si legge all'apertura della vista e dopo ogni azione
    refresh();
  }, []);

  /** Esegue un'azione bloccando i pulsanti, poi rilegge l'elenco. Se l'azione riesce e
   *  `done` è indicato, lo mostra come messaggio (al posto di quello dell'azione precedente). */
  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    try {
      await action();
      if (done) onNotice(done);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      await refresh();
      onChanged();
    }
  }

  // Tracce con lo stesso tipo, data e numero di un'altra: su Moodle i nomi sarebbero uguali
  const sameName = sameNameIds(tracks ?? []);

  const visible = (tracks ?? []).filter(
    (t) => (!kind || t.kind === kind) && (!year || t.day?.startsWith(`${year}-`)),
  );

  return (
    <article className="archive-view">
      <header className="view-head">
        <h1>Archivio</h1>
        <p className="view-lede">
          Tutte le tracce preparate, salvate automaticamente. Aprine una per modificarla o
          duplicala come punto di partenza per un nuovo appello.
        </p>
      </header>

      <div className="archive-toolbar">
        <div className="segmented archive-tabs" role="tablist" aria-label="Archivio o cestino">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "archive"}
            className={tab === "archive" ? "selected" : ""}
            onClick={() => setTab("archive")}
          >
            Tracce ({tracks?.length ?? 0})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "trash"}
            className={tab === "trash" ? "selected" : ""}
            onClick={() => setTab("trash")}
          >
            Cestino ({trash.length})
          </button>
        </div>
        {tab === "archive" ? (
          <div className="archive-filters">
            <button
              type="button"
              className="ghost small"
              disabled={busy}
              title="Ogni traccia trovata nei file diventa una traccia dell'archivio"
              onClick={() => run(props.onImportFiles)}
            >
              <IconImport /> Importa XML nell'archivio
            </button>
            <label>
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as ExamKind | "")}>
                <option value="">Tutti</option>
                <option value="Esame">Esame</option>
                <option value="Pretest">Pretest</option>
              </select>
            </label>
            <label>
              Anno
              <select
                value={year}
                onChange={(e) => setYear(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Tutti</option>
                {trackYears(tracks ?? []).map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          trash.length > 0 && (
            <button
              type="button"
              className="ghost danger"
              disabled={busy}
              onClick={() => {
                const n = trash.length;
                const what = n === 1 ? "la traccia nel cestino" : `le ${n} tracce nel cestino`;
                const lost = n === 1 ? "Non si potrà recuperare." : "Non si potranno recuperare.";
                const message = `Eliminare definitivamente ${what}? ${lost}`;
                if (!window.confirm(message)) return;
                run(
                  emptyTrash,
                  n === 1
                    ? "Cestino svuotato: 1 traccia eliminata definitivamente."
                    : `Cestino svuotato: ${n} tracce eliminate definitivamente.`,
                );
              }}
            >
              <IconTrash /> Svuota cestino
            </button>
          )
        )}
      </div>

      {tracks === null ? (
        <p className="empty-state">Lettura dell'archivio…</p>
      ) : tab === "archive" ? (
        visible.length === 0 ? (
          <p className="empty-state">
            {tracks.length === 0
              ? "L'archivio è vuoto: una traccia compare qui appena ha un esercizio o dei test comuni."
              : "Nessuna traccia con questi filtri."}
          </p>
        ) : (
          <ul className="archive-list">
            {visible.map((t) => {
              const current = t.id === currentId;
              return (
                <li key={t.id} className={current ? "archive-row current" : "archive-row"}>
                  <div className="archive-info">
                    <span className="archive-title">
                      {trackLabel(t)}
                      {current && <span className="archive-badge">aperta</span>}
                      {sameName.has(t.id) && (
                        <span
                          className="archive-badge warning"
                          title="Un'altra traccia ha lo stesso tipo, data e numero: cambiane uno prima di esportarla"
                        >
                          stesso nome di un'altra
                        </span>
                      )}
                    </span>
                    <span className="archive-meta">
                      {t.exercise_count === 1 ? "1 esercizio" : `${t.exercise_count} esercizi`} ·
                      modificata {formatMoment(t.updated_at)} ·{" "}
                      {t.exported_at ? `esportata ${formatMoment(t.exported_at)}` : "mai esportata"}
                    </span>
                  </div>
                  <div className="archive-actions">
                    {!current && (
                      <button
                        type="button"
                        className="secondary small"
                        disabled={busy}
                        onClick={() => run(() => onOpen(t.id))}
                      >
                        Apri
                      </button>
                    )}
                    <button
                      type="button"
                      className="ghost small"
                      disabled={busy}
                      title="Crea una copia e la apre"
                      onClick={() => run(() => onDuplicate(t.id))}
                    >
                      <IconCopy /> Duplica
                    </button>
                    <button
                      type="button"
                      className="ghost small danger"
                      disabled={busy}
                      title="Sposta nel cestino; si può recuperare"
                      onClick={() =>
                        run(
                          () => onTrash(t.id),
                          // Per la traccia aperta il messaggio lo dà l'applicazione, che ne apre una nuova
                          current
                            ? undefined
                            : `Spostata nel cestino: ${trackLabel(t)}. Si può ripristinare dalla scheda Cestino.`,
                        )
                      }
                    >
                      <IconTrash /> Cestino
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : trash.length === 0 ? (
        <p className="empty-state">Il cestino è vuoto.</p>
      ) : (
        <ul className="archive-list">
          {trash.map((t) => (
            <li key={t.id} className="archive-row">
              <div className="archive-info">
                <span className="archive-title">{trackLabel(t)}</span>
                <span className="archive-meta">
                  {t.exercise_count === 1 ? "1 esercizio" : `${t.exercise_count} esercizi`} ·
                  nel cestino dal {t.deleted_at ? formatMoment(t.deleted_at) : "?"}
                </span>
              </div>
              <div className="archive-actions">
                <button
                  type="button"
                  className="secondary small"
                  disabled={busy}
                  onClick={() => run(() => restoreTrack(t.id), `Ripristinata dal cestino: ${trackLabel(t)}.`)}
                >
                  <IconRestore /> Ripristina
                </button>
                <button
                  type="button"
                  className="ghost small danger"
                  disabled={busy}
                  onClick={() => {
                    const message = `Eliminare definitivamente «${trackLabel(t)}»? Non si potrà recuperare.`;
                    if (!window.confirm(message)) return;
                    run(() => deleteTrack(t.id), `Eliminata definitivamente: ${trackLabel(t)}.`);
                  }}
                >
                  <IconTrash /> Elimina
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="archive-backup" aria-label="Backup">
        <h2>Backup</h2>
        <p className="view-lede">
          Una copia di tutto l'archivio, cestino compreso, in un file da conservare (per esempio su
          una chiavetta o su OneDrive). Il ripristino sostituisce l'archivio attuale, che viene
          comunque conservato in una copia.
        </p>
        <div className="view-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => run(props.onBackup)}
          >
            <IconExport /> Salva un backup…
          </button>
          <button
            type="button"
            className="ghost"
            disabled={busy}
            onClick={() => run(props.onRestore)}
          >
            <IconRestore /> Ripristina da backup…
          </button>
        </div>
      </section>
    </article>
  );
}
